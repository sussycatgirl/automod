import { FindOneResult } from "monk";
import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import ServerConfig from "../../../struct/ServerConfig";
import { scanServer } from "../../modules/user_scan";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

let userscans: string[] = [];

export default {
    name: 'botctl',
    aliases: null,
    description: 'Perform administrative actions',
    category: CommandCategory.Config,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!isBotManager(message)) return message.reply(NO_MANAGER_MSG);

        let action = args.shift();
        switch(action) {
            case 'scan_userlist':
                try {
                    let serverConf: FindOneResult<ServerConfig> = await dbs.SERVERS.findOne({ id: message.serverContext._id });

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

            case 'ignore_blacklist':
                try {
                    if (args[0] == 'yes') {
                        await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { allowBlacklistedUsers: true } });
                        await message.reply('Globally blacklisted users will no longer get banned in this server. Previously banned users will need to be unbanned manually.');
                    } else if (args[0] == 'no') {
                        await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { allowBlacklistedUsers: false } });
                        await message.reply('Globally blacklisted users will now get banned in this server.');
                    } else {
                        await message.reply(`Please specify either 'yes' or 'no' to toggle this setting.`);
                    }
                } catch(e) {
                    console.error(''+e);
                    message.reply('Something went wrong: ' + e);
                }
            break;

            case undefined:
            case '':
                message.reply(`### Available subcommands\n`
                            + `- \`scan_userlist\` - If user scanning is enabled, this will scan the entire user list.\n`
                            + `- \`ignore_blacklist\` - Ignore the bot's global blacklist.`);
            break
            default:
                message.reply(`Unknown option`);
        }
    }
} as SimpleCommand;
