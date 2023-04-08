import ServerConfig from "automod/dist/types/ServerConfig";
import axios from "axios";
import FormData from "form-data";
import { client, dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { checkMessageForFilteredWords } from "../../modules/antispam";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import { embed, EmbedColor, getAutumnURL, getDmChannel, isBotManager, NO_MANAGER_MSG, sanitizeMessageContent } from "../../util";

const WORDLIST_DEFAULT_MESSAGE = '<@{{user_id}}>, the message you sent contained a blocked word.';

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

            case 'filter': {
                const config = await dbs.SERVERS.findOne({ id: message.channel!.server_id! });
                switch(args.shift()?.toLowerCase()) {
                    case 'enable': {
                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $set: { wordlistEnabled: true } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed(
                                `### Word filter enabled!\nThere are currently ${config?.wordlist?.length ?? 0} words on your list.`,
                                null,
                                EmbedColor.Success
                            ),
                        ] });
                        break;
                    }
                    case 'disable': {
                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $set: { wordlistEnabled: false } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed('Word filter disabled.', null, EmbedColor.SoftError),
                        ] });
                        break;
                    }
                    case 'add': {
                        let strictness: any = 'HARD';
                        if (['soft', 'hard', 'strict'].includes(args[0].toLowerCase())) {
                            strictness = args.shift()!.toUpperCase() as any;
                        }

                        const word = args.join(' ').toLowerCase();
                        if (!word) return message.reply('You didn\'t provide a word to add to the list!');
                        if (config?.wordlist?.find(w => w.word == word)) return await message.reply('That word is already on the list!');

                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $push: { wordlist: { strictness, word } } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed(`Word added with strictness **${strictness}**.`, null, EmbedColor.Success),
                        ] });
                        break;
                    }
                    case 'remove': {
                        const word = args.join(' ').toLowerCase();
                        if (!word) return message.reply('You need to provide the word to remove from the list.');

                        if (!config?.wordlist?.find(w => w.word == word)) return await message.reply('That word is not on the list.');
                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $pull: { wordlist: { word } } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed(`Word removed.`, null, EmbedColor.Success),
                        ] });
                        break;
                    }
                    case 'show': {
                        const formData = new FormData();
                        formData.append(
                            `wordlist_${message.channel?.server_id}`,
                            config?.wordlist?.map(w => `${w.strictness}\t${w.word}`).join('\n') ?? '',
                            `wordlist_${message.channel?.server_id}.txt`
                        );

                        try {
                            const channel = await getDmChannel(message.author_id);
                            const res = await axios.post(
                                `${await getAutumnURL()}/attachments`,
                                formData,
                                { headers: formData.getHeaders(), responseType: 'json' }
                            );
                            await channel.sendMessage({
                                attachments: [ (res.data as any).id ],
                                embeds: [ embed(
                                    `Here's the current word list for **${message.channel?.server?.name}**.`,
                                    'Word List',
                                    EmbedColor.Success
                                ) ],
                            });
                            await message.reply({ embeds: [
                                embed(`I have sent the current word list to your direct messages!`, null, EmbedColor.Success),
                            ] });
                        } catch(e) {
                            console.error(e);
                        }
                        break;
                    }
                    case 'message': {
                        const msg = args.join(' ');
                        if (!msg) {
                            return await message.reply({ embeds: [
                                embed(
                                    'This command lets you change the message the bot will send if a message is filtered.\n' +
                                    'Note that this message will not be sent if the configured action is to log events only.\n' +
                                    'The current message is:\n' +
                                    `>${sanitizeMessageContent(config?.wordlistAction?.message ?? WORDLIST_DEFAULT_MESSAGE).trim().replace(/\n/g, '\n>')}\n` +
                                    '`{{user_id}}` will be substituted for the target user\'s ID.',
                                    'Warning message',
                                    EmbedColor.Success
                                ),
                            ] });
                        }

                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $set: { wordlistAction: { action: config?.wordlistAction?.action ?? 'LOG', message: msg } } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed(
                                'Filter message set!',
                                null,
                                EmbedColor.Success
                            ),
                        ] });
                        break;
                    }
                    case 'action': {
                        let action: string;
                        switch(args[0]?.toLowerCase()) {
                            case 'log':
                            case 'delete':
                            case 'warn':
                                action = args[0].toUpperCase();
                                break;
                            default:
                                await message.reply({ embeds: [
                                    embed(
                                        'Please provide one of the following arguments:\n' +
                                            '- **log** (Log the message in mod action log channel)\n' +
                                            '- **delete** (Log and delete the message)\n' +
                                            '- **warn** (Log and delete message, warn user)\n\n' +
                                            `The currently configured action is **${config?.wordlistAction?.action ?? 'LOG'}**.`,
                                        null,
                                        EmbedColor.SoftError
                                    ),
                                ] });
                                return;
                        }

                        await dbs.SERVERS.update(
                            { id: message.channel!.server_id! },
                            { $set: { wordlistAction: {
                                action: action as any,
                                message: config?.wordlistAction?.message ?? WORDLIST_DEFAULT_MESSAGE
                            } } },
                            { upsert: true },
                        );
                        await message.reply({ embeds: [
                            embed(
                                `Filter action set to **${action}**. ` +
                                `Please make sure you configured a logging channel using **${DEFAULT_PREFIX}botctl logs**.`,
                                null,
                                EmbedColor.Success
                            ),
                        ] });
                        break;
                    }
                    case 'test': {
                        const match = checkMessageForFilteredWords(args.join(' '), config  as ServerConfig);
                        await message.reply({ embeds: [
                            match
                                ? embed('Your word list matches this test phrase!', 'Filter Test', EmbedColor.SoftError)
                                : embed('Your word list does not match this test phrase!', 'Filter Test', EmbedColor.Success)
                        ] });
                        break;
                    }
                    default: {
                        await message.reply({ embeds: [
                            embed(
                                `### This command allows you to configure a manual word filter.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter enable** - Enable the word filter.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter disable** - Disable the word filter.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter add [soft|hard] [word]** - Add a word to the list. If omitted, defaults to 'hard'.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter remove** - Remove a word from the list.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter show** - Send the current filter list.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter message [message]** - Set the message sent when a message is matched.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter action [log|delete|warn]** - Configure the action taken on filtered messages.\n` +
                                `- **${DEFAULT_PREFIX}botctl filter test [phrase]** - Test whether a phrase matches your word list.\n`,
                                'Word filter',
                            ),
                            embed(
                                `**Enabled:** ${!!config?.wordlistEnabled}` + (!config?.wordlistEnabled
                                    ? ''
                                    : `\n**Action:** ${config?.wordlistAction?.action ?? 'LOG'}\n` +
                                      `**Warning message:** ${config?.wordlistAction?.message}\n` +
                                      `**Wordlist length:** ${config?.wordlist?.length ?? 0}`),
                                'Current configuration',
                                config?.wordlistEnabled ? EmbedColor.Success : EmbedColor.SoftError,
                            ),
                        ] });
                        break;
                    }
                }
                break;
            }

            case undefined:
                case '':
                message.reply(`### Available subcommands\n`
                + `- \`ignore_blacklist\` - Ignore the bot's global blacklist.\n`
                + `- \`spam_detection\` - Toggle automatic spam detection.\n`
                + `- \`logs\` - Configure log channels.\n`
                + `- \`filter\` - Configure word filter.\n`);
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

export { WORDLIST_DEFAULT_MESSAGE }
