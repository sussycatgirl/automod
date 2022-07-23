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
        if (!await isBotManager(message)) return message.reply(NO_MANAGER_MSG);

        try {
        let action = args.shift();
        switch(action) {
            case 'ignore_blacklist': {
                if (args[0] == 'yes') {
                    await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { allowBlacklistedUsers: true } });
                    await message.reply('Globally blacklisted users will no longer get banned in this server. Previously banned users will need to be unbanned manually.');
                } else if (args[0] == 'no') {
                    await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { allowBlacklistedUsers: false } });
                    await message.reply('Globally blacklisted users will now get banned in this server.');
                } else {
                    await message.reply(`Please specify either 'yes' or 'no' to toggle this setting.`);
                }
                break;
            }
                
            case 'spam_detection': {
                if (args[0] == 'on') {
                    await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { antispamEnabled: true } });
                    await message.reply('Spam detection is now enabled in this server.\nIf a user wrongfully gets kicked '
                        + 'or banned, please report it here: https://rvlt.gg/jan\n\n'
                        + 'Please make sure to grant AutoMod permission to **Kick**, **Ban** and **Manage Messages**!');
                } else if (args[0] == 'off') {
                    await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { antispamEnabled: false } });
                    await message.reply('Spam detection is now disabled in this server.');

                } else {
                    const cfg = await dbs.SERVERS.findOne({ id: message.serverContext._id });
                    await message.reply(`Spam detection is currently **${cfg?.antispamEnabled ? 'enabled' : 'disabled'}**. `
                        + `Please specify either 'on' or 'off' to toggle this setting.`);
                }
                break;
            }

            case undefined:
                case '':
                message.reply(`### Available subcommands\n`
                + `- \`ignore_blacklist\` - Ignore the bot's global blacklist.\n`
                + `- \`spam_detection\` - Toggle automatic spam detection.\n`);
            break
            default:
                message.reply(`Unknown option`);
            }
        } catch(e) {
            console.error(''+e);
            message.reply('Something went wrong: ' + e);
        }
    }
} as SimpleCommand;
