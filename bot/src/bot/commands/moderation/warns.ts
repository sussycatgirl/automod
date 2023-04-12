import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { dbs } from "../../..";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import { isModerator, NO_MANAGER_MSG, parseUserOrId, uploadFile } from "../../util";
import Day from 'dayjs';
import RelativeTime from 'dayjs/plugin/relativeTime';
import Xlsx from 'xlsx';
import { fetchUsername } from "../../modules/mod_logs";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

Day.extend(RelativeTime);

const GLOBAL_BLACKLIST_TEXT = (reason?: string) => `> :warning: This user has been flagged and is globally blacklisted. [Learn more.](https://github.com/janderedev/automod/wiki/Global-Blacklist)`
    + `${reason ? `\nReason: "${reason}"` : ''}\n\n`;

export default {
    name: 'warns',
    aliases: [ 'warnings', 'infractions', 'infraction' ],
    description: 'Show all user infractions',
    syntax: '/warns; /warns @username ["export-csv"]; /warns rm [ID]',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        let infractions: Array<Infraction> = await dbs.INFRACTIONS.find({
            server: message.serverContext.id,
        });
        let userInfractions: Map<string, Infraction[]> = new Map();
        infractions.forEach(i => {
            if (!userInfractions.get(i.user)) userInfractions.set(i.user, [ i ]);
            else userInfractions.set(i.user, [ i, ...userInfractions.get(i.user)! ]);
        });

        if (!args[0]) {
            if (!await isModerator(message)) return message.reply(NO_MANAGER_MSG);

            // Show top most warned users
            let msg = `## Most warned users in ${message.serverContext.name}\n\u200b\n`;
            for (let inf of Array.from(userInfractions.values()).sort((a, b) => b.length - a.length).slice(0, 9)) {
                inf = inf.sort((a, b) => b.date - a.date);
                msg += `**${await fetchUsername(inf[0].user)}** (${inf[0].user}): **${inf.length}** infractions\n`;
                msg += `\u200b \u200b \u200b \u200b \u200b ↳ Most recent infraction: ${getInfEmoji(inf[0])}\`${inf[0].reason}\` `
                    + `${inf[0].type == InfractionType.Manual ? `(${await fetchUsername(inf[0].createdBy ?? '')})` : ''}\n`;
            };

            message.reply(msg.substring(0, 1999));
        } else {
            switch(args[0]?.toLowerCase()) {
                case 'delete':
                case 'remove':
                case 'rm':
                case 'del':
                    if (!await isModerator(message)) return message.reply(NO_MANAGER_MSG);

                    let id = args[1];
                    if (!id) return message.reply('No infraction ID provided.');
                    let inf = await dbs.INFRACTIONS.findOneAndDelete({
                        _id: { $eq: id.toUpperCase() },
                        server: message.serverContext.id
                    });

                    if (!inf) return message.reply('I can\'t find that ID.');

                    message.reply(`## Infraction deleted\n`
                                + `ID: \`${inf._id}\`\n`
                                + `Reason: ${getInfEmoji(inf)}\`${inf.reason}\` `
                                    + `(${inf.type == InfractionType.Manual ? await fetchUsername(inf.createdBy ?? '') : 'System'})\n`
                                + `Created ${Day(inf.date).fromNow()}`);
                break;
                default:
                    let user = await parseUserOrId(args[0]);
                    if (!user?.id) return message.reply('I can\'t find this user.');

                    
                    if (user.id != message.authorId && !await isModerator(message)) return message.reply(NO_MANAGER_MSG);

                    const infs = userInfractions.get(user.id);
                    const userConfig = await dbs.USERS.findOne({ id: user.id });

                    if (!infs) return message.reply(`There are no infractions stored for \`${await fetchUsername(user.id)}\`.`
                        + (userConfig?.globalBlacklist ? '\n' + GLOBAL_BLACKLIST_TEXT(userConfig.blacklistReason) : ''), false);
                    else {
                        let msg = `## ${infs.length} infractions stored for ${await fetchUsername(user.id)}\n`;

                        if (userConfig?.globalBlacklist) {
                            msg += GLOBAL_BLACKLIST_TEXT(userConfig.blacklistReason);
                        } else msg += '\u200b\n';

                        let attachSpreadsheet = false;
                        for (const i in infs) {
                            let inf = infs[i];
                            let toAdd = '';
                            toAdd += `#${Number(i)+1}: ${getInfEmoji(inf)} \`${inf.reason}\` (${inf.type == InfractionType.Manual ? await fetchUsername(inf.createdBy!) : 'System'})\n`;
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
                                    [`Warns for ${await fetchUsername(user.id)} (${user.id}) - ${Day().toString()}`],
                                    [],
                                    ['Date', 'Reason', 'Created By', 'Type', 'Action Type', 'ID'],
                                ];

                                for (const inf of infs) {
                                    csv_data.push([
                                        Day(inf.date).toString(),
                                        inf.reason,
                                        inf.type == InfractionType.Manual ? `${await fetchUsername(inf.createdBy!)} (${inf.createdBy})` : 'SYSTEM',
                                        inf.type == InfractionType.Automatic ? 'Automatic' : 'Manual',
                                        inf.actionType || 'warn',
                                        inf._id,
                                    ]);
                                }

                                let sheet = Xlsx.utils.aoa_to_sheet(csv_data);
                                let csv = Xlsx.utils.sheet_to_csv(sheet);

                                message.reply({ content: msg, attachments: [ await uploadFile(csv, `${user.id}.csv`) ] }, false);
                            } catch(e) {
                                console.error(e);
                                message.reply(msg, false);
                            }
                        } else message.reply(msg, false);
                    }
                break;
            }
        }
    }
} as SimpleCommand;

function getInfEmoji(inf: Infraction) {
    switch(inf.actionType) {
        case 'kick': return ':mans_shoe: ';
        case 'ban': return ':hammer: ';
        default: return '';
    }
}
