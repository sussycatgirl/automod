import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isBotManager, NO_MANAGER_MSG } from "../../util";

export default {
    name: 'botctl',
    aliases: null,
    description: 'Perform administrative actions',
    category: CommandCategory.Config,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!isBotManager(message)) return message.reply(NO_MANAGER_MSG);

        let action = args.shift();
        switch(action) {
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
                            + `- \`ignore_blacklist\` - Ignore the bot's global blacklist.`);
            break
            default:
                message.reply(`Unknown option`);
        }
    }
} as SimpleCommand;
