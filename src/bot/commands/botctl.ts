import { FindOneResult } from "monk";
import { client } from "../..";
import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";
import ServerConfig from "../../struct/ServerConfig";
import { scanServer } from "../modules/user_scan";
import { isBotManager, NO_MANAGER_MSG } from "../util";

let userscans: string[] = [];

export default {
    name: 'botctl',
    aliases: null,
    description: 'Perform administrative actions',
    category: 'configuration',
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!isBotManager(message.member!, message.serverContext)) return message.reply(NO_MANAGER_MSG);

        let action = args.shift();
        switch(action) {
            case 'scan_userlist':
                try {
                    let serverConf: FindOneResult<ServerConfig> = await client.db.get('servers').findOne({ id: message.serverContext._id });

                    if (!serverConf?.enableUserScan) return message.reply(`User scanning is not enabled for this server.`);
                    if (userscans.includes(message.serverContext._id)) return message.reply(`There is already a scan running for this server.`);
                    userscans.push(message.serverContext._id);

                    let msg = await message.reply(`Fetching users...`);

                    let counter = 0;

                    let onUserScan = async () => {
                        counter++;
                        if (counter % 10 == 0) await msg?.edit({ content: `Fetching users... ${counter}` });
                    }

                    let onDone = async () => {
                        msg?.edit({ content: `All done! (${counter} users fetched)` });
                        userscans = userscans.filter(s => s != message.serverContext._id);
                    }

                    await scanServer(message.serverContext._id, onUserScan, onDone);
                } catch(e) {
                    message.reply(`An error occurred: ${e}`);
                    userscans = userscans.filter(s => s != message.serverContext._id);
                }
            break;
            case undefined:
            case '':
                message.reply(`### Available subcommands\n`
                            + `- \`scan_userlist\` - If user scanning is enabled, this will scan the entire user list.`);
            break
            default:
                message.reply(`Unknown option`);
        }
    }
} as Command;
