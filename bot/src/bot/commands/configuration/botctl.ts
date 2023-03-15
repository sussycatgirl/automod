import { client, dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
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
                    if (message.serverContext.discoverable) {
                        return message.reply('Your server is currently listed in server discovery. As part of Revolt\'s [Discover Guidelines](<https://support.revolt.chat/kb/safety/discover-guidelines>), all servers on Discover are enrolled to AutoMod\'s antispam features.');
                    }

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
                    await message.reply('Spam detection is now enabled in this server.\nIf a user is wrongfully kicked '
                        + 'or banned, please report it here: https://rvlt.gg/jan\n\n'
                        + 'Please make sure to grant AutoMod permission to **Kick**, **Ban** and **Manage Messages**!');
                } else if (args[0] == 'off') {
                    if (message.serverContext.discoverable) {
                        return message.reply('Your server is currently listed in server discovery. As part of Revolt\'s [Discover Guidelines](<https://support.revolt.chat/kb/safety/discover-guidelines>), all servers on Discover are enrolled to AutoMod\'s antispam features.');
                    }

                    await dbs.SERVERS.update({ id: message.serverContext._id }, { $set: { antispamEnabled: false } });
                    await message.reply('Spam detection is now disabled in this server.');

                } else {
                    const cfg = await dbs.SERVERS.findOne({ id: message.serverContext._id });
                    await message.reply(`Spam detection is currently **${cfg?.antispamEnabled ? 'enabled' : 'disabled'}**. `
                        + `Please specify either 'on' or 'off' to toggle this setting.`);
                }
                break;
            }

            case 'logs': {
                if (!args[0]) {
                    return await message.reply(
                        `No category specified. Syntax: ${DEFAULT_PREFIX}botctl logs [category] [#channel]\n` +
                        `Categories: \`messageupdate\`, \`modaction\``,
                    );
                }

                if (!args[1]) {
                    return await message.reply('No target channel specified.');
                }

                let channelInput = args[1];
                if (channelInput.startsWith('<#') && channelInput.endsWith('>')) {
                    channelInput = channelInput.substring(2, channelInput.length - 1);
                }

                const channel = client.channels.get(channelInput);
                if (!channel) return message.reply('I can\'t find that channel.');
                if (channel.server_id != message.channel?.server_id) return message.reply('That channel is not part of this server!');
                if (!channel.havePermission('SendMessage')) return message.reply('I don\'t have permission to **send messages** in that channel.');
                if (!channel.havePermission('SendEmbeds')) return message.reply('I don\'t have permission to **send embeds** in that channel.');

                switch(args[0]?.toLowerCase()) {
                    case 'messageupdate': {
                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            {
                                $set: {
                                    'logs.messageUpdate.revolt': {
                                        channel: channel._id,
                                        type: 'EMBED',
                                    },
                                },
                                $setOnInsert: {
                                    id: message.channel!.server_id!,
                                }
                            },
                            { upsert: true },
                        );
                        await message.reply(`Bound message update logs to <#${channel._id}>!`);
                        break;
                    }

                    case 'modaction': {
                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            {
                                $set: {
                                    'logs.modAction.revolt': {
                                        channel: channel._id,
                                        type: 'EMBED',
                                    },
                                },
                                $setOnInsert: {
                                    id: message.channel!.server_id!,
                                }
                            },
                            { upsert: true },
                        );
                        await message.reply(`Bound moderation logs to <#${channel._id}>!`);
                        break;
                    }

                    default: {
                        return await message.reply('Unknown log category');
                    }
                }
                break;
            }

            case undefined:
                case '':
                message.reply(`### Available subcommands\n`
                + `- \`ignore_blacklist\` - Ignore the bot's global blacklist.\n`
                + `- \`spam_detection\` - Toggle automatic spam detection.\n`
                + `- \`logs\` - Configure log channels.\n`);
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
