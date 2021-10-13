import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";
import { client } from "../..";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import { isModerator, NO_MANAGER_MSG, parseUser } from "../util";
import Day from 'dayjs';
import RelativeTime from 'dayjs/plugin/relativeTime';
import Xlsx from 'xlsx';
import FormData from 'form-data';
import axios from "axios";

Day.extend(RelativeTime);

export default {
    name: 'warns',
    aliases: [ 'warnings', 'infractions', 'infraction' ],
    description: 'Show all user infractions',
    syntax: '/warns; /warns @username; /warns @username export-csv',
    run: async (message: Message, args: string[]) => {
        if (!await isModerator(message.member!)) return message.reply(NO_MANAGER_MSG);

        let collection = client.db.get('infractions');
        let infractions: Array<Infraction> = await collection.find({
            server: message.channel?.server_id,
        });
        let userInfractions: Map<string, Infraction[]> = new Map();
        infractions.forEach(i => {
            if (!userInfractions.get(i.user)) userInfractions.set(i.user, [ i ]);
            else userInfractions.set(i.user, [ i, ...userInfractions.get(i.user)! ]);
        });

        if (!args[0]) {
            // Show top most warned users
            let msg = `## Most warned users in ${message.channel?.server?.name ?? 'this server'}\n\u200b\n`;
            for (let inf of Array.from(userInfractions.values()).sort((a, b) => b.length - a.length).slice(0, 9)) {
                inf = inf.sort((a, b) => b.date - a.date);
                msg += `**${await fetchUsername(inf[0].user)}** (${inf[0].user}): **${inf.length}** infractions\n`;
                msg += `\u200b \u200b \u200b \u200b \u200b ↳ Most recent warning: \`${inf[0].reason}\` `
                    + `${inf[0].type == InfractionType.Manual && `(${await fetchUsername(inf[0].createdBy ?? '')})`}\n`;
            };

            message.reply(msg.substr(0, 1999));
        } else {
            let user = await parseUser(args[0]);
            if (!user) return message.reply('Unknown user');

            let infs = userInfractions.get(user._id);
            if (!infs) return message.reply(`There are no infractions stored for \`@${user.username}\`.`);
            else {
                let msg = `## ${infs.length} infractions stored for @${user.username}\n\u200b\n`;
                let attachSpreadsheet = false;
                for (const i in infs) { console.log(i)
                    let inf = infs[i];
                    let toAdd = '';
                    toAdd += `#${Number(i)+1}: \`${inf.reason}\` (${inf.type == InfractionType.Manual ? await fetchUsername(inf.createdBy!) : 'System'})\n`;
                    toAdd += `\u200b \u200b \u200b \u200b \u200b ↳ ${Day(inf.date).fromNow()} (Infraction ID: \`${inf._id}\`)\n`;

                    if ((msg + toAdd).length > 1900 || Number(i) > 5) {
                        msg += `\u200b\n[${infs.length - Number(i) + 1} more, check attached file]`;
                        attachSpreadsheet = true;
                        break;
                    }
                    else msg += toAdd;
                }

                if (args[1]?.toLowerCase() == 'export-csv' ||
                    args[1]?.toLowerCase() == 'csv' ||
                    args[1]?.toLowerCase() == 'export') attachSpreadsheet = true;

                if (attachSpreadsheet) {
                    try {
                        let csv_data = [
                            [`Warns for @${user.username} (${user._id}) - ${Day().toString()}`],
                            [],
                            ['Date', 'Reason', 'Created By', 'Type', 'ID'],
                        ];

                        for (const inf of infs) {
                            csv_data.push([
                                Day(inf.date).toString(),
                                inf.reason,
                                inf.type == InfractionType.Manual ? `${await fetchUsername(inf.createdBy!)} (${inf.createdBy})` : 'SYSTEM',
                                inf.type == InfractionType.Automatic ? 'Automatic' : 'Manual',
                                inf._id,
                            ]);
                        }

                        let sheet = Xlsx.utils.aoa_to_sheet(csv_data);

                        let csv = Xlsx.utils.sheet_to_csv(sheet);

                        let apiConfig: any = (await axios.get(client.apiURL)).data;
                        let autumnURL = apiConfig.features.autumn.url;
                        
                        let data = new FormData();
                        data.append("file", csv, { filename: `${user._id}.csv` });

                        let req = await axios.post(autumnURL + '/attachments', data, { headers: data.getHeaders() });
                        message.reply({ content: msg, attachments: [ (req.data as any)['id'] as string ] });
                    } catch(e) {
                        console.error(e);
                        message.reply(msg);
                    }
                } else message.reply(msg);
            }
        }
    }
} as Command;

let fetchUsername = async (id: string) => {
    try {
        let u = await client.users.fetch(id);
        return `@${u.username}`;
    } catch(e) { return 'Unknown user' }
}
