import { Message } from "revolt.js";
import { ulid } from "ulid";
import { client, dbs } from "../..";
import AntispamRule from "automod/dist/types/antispam/AntispamRule";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import ModerationAction from "automod/dist/types/antispam/ModerationAction";
import logger from "../logger";
import { awaitClient, generateInfractionDMEmbed, isModerator, sendLogMessage, storeInfraction } from "../util";
import { getDmChannel, sanitizeMessageContent } from "../util";
import ServerConfig from "automod/dist/types/ServerConfig";
import { WORDLIST_DEFAULT_MESSAGE } from "../commands/configuration/botctl";

let msgCountStore: Map<string, { users: any }> = new Map();

// Should use redis for this
const SENT_FILTER_MESSAGE: string[] = [];

/**
 * 
 * @param message 
 * @returns true if ok, false if spam rule triggered
 */
async function antispam(message: Message): Promise<boolean> {
    try {
        let serverRules = await dbs.SERVERS.findOne({ id: message.channel!.serverId! });
        if (!serverRules?.automodSettings) return true;

        let ruleTriggered = false;

        for (const rule of serverRules.automodSettings.spam) {
            if (msgCountStore.get(rule.id) == null) {
                msgCountStore.set(rule.id, { users: {} });
            }

            if (message.author?.bot != null) break;
            if (serverRules.whitelist?.users?.includes(message.authorId!)) break;
            if (message.member?.roles?.filter(r => serverRules!.whitelist?.roles?.includes(r)).length) break;
            if (serverRules.whitelist?.managers !== false && await isModerator(message, false)) break;
            if (rule.channels?.length && rule.channels.indexOf(message.channelId) == -1) break;

            let store = msgCountStore.get(rule.id)!;
            if (!store.users[message.channelId]) store.users[message.channelId] = {}
            let userStore = store.users[message.channelId];

            if (!userStore.count) userStore.count = 1;
            else userStore.count++;

            setTimeout(() => userStore.count--, rule.timeframe * 1000);

            if (userStore.count > rule.max_msg) {
                logger.info(`Antispam rule triggered: ${rule.max_msg}/${rule.timeframe} -> ${ModerationAction[rule.action]}`);
                ruleTriggered = true;

                switch(Number(rule.action)) {
                    case ModerationAction.Delete:
                        message.delete()
                            .catch(() => logger.warn('Antispam: Failed to delete message') );
                    break;
                    case ModerationAction.Message:
                        if (!userStore.warnTriggered) {
                            userStore.warnTriggered = true;
                            setTimeout(() => userStore.warnTriggered = false, 5000);
                            message.channel?.sendMessage(getWarnMsg(rule, message))
                                .catch(() => logger.warn('Antispam: Failed to send message'));
                        }
                    break;
                    case ModerationAction.Warn:
                        if (!userStore.warnTriggered) {
                            userStore.warnTriggered = true;
                            setTimeout(() => userStore.warnTriggered = false, 5000);

                            let inf = {
                                _id: ulid(),
                                createdBy: null,
                                date: Date.now(),
                                reason: `Automatic moderation rule triggered: More than ${rule.max_msg} messages per ${rule.timeframe} seconds.`,
                                server: message.channel?.serverId,
                                type: InfractionType.Automatic,
                                user: message.authorId,
                            } as Infraction;

                            message.channel?.sendMessage('## User has been warned.\n\u200b\n' + getWarnMsg(rule, message))
                                .catch(() => logger.warn('Antispam: Failed to send warn message'));

                            await storeInfraction(inf);
                        }
                    break;
                    case ModerationAction.Kick:
                        message.reply('(Kick user)');
                    break;
                    case ModerationAction.Ban:
                        message.reply('(Ban user)');
                    break;
                    default: logger.warn(`Unknown Moderation Action: ${rule.action}`);
                }
            }
        }

        return !ruleTriggered;
    } catch(e) {
        console.error(''+e);
        return true;
    }
}

function getWarnMsg(rule: AntispamRule, message: Message) {
    if (rule.message != null) {
        return rule.message
            .replace(new RegExp('{{userid}}', 'gi'), message.authorId!);
    } else return `<@${message.authorId}>, please stop spamming.`;
}

/**
 * Run word filter check and act on message if required
 */
async function wordFilterCheck(message: Message, config: ServerConfig) {
    try {
        if (!message.content) return;
        const match = checkMessageForFilteredWords(message.content, config);
        if (!match) return;

        if (await isModerator(message, false)) return;

        console.log('Message matched word filter!');

        // Lack of `break` is intended here
        switch(config.wordlistAction?.action) {
            case 'WARN': {
                try {
                    const infraction: Infraction = {
                        _id: ulid(),
                        createdBy: null,
                        date: Date.now(),
                        reason: 'Word filter triggered',
                        server: message.channel!.serverId!,
                        type: InfractionType.Automatic,
                        user: message.authorId!,
                    }

                    await storeInfraction(infraction);

                    if (config.dmOnWarn) {
                        const embed = generateInfractionDMEmbed(message.channel!.server!, config, infraction, message);
                        const dmChannel = await getDmChannel(message.author!);

                        if (dmChannel.havePermission('SendMessage') && dmChannel.havePermission('SendEmbeds')) {
                            await dmChannel.sendMessage({ embeds: [ embed ] });
                        }
                        else logger.warn('Missing permission to DM user.');
                    }
                } catch(e) {
                    console.error(e);
                }
            }
            case 'DELETE': {
                if (message.channel?.havePermission('ManageMessages')) {
                    const key = `${message.authorId}:${message.channelId}`;
                    await message.delete();

                    if (!SENT_FILTER_MESSAGE.includes(key)) {
                        SENT_FILTER_MESSAGE.push(key);
                        setTimeout(() => SENT_FILTER_MESSAGE.splice(SENT_FILTER_MESSAGE.indexOf(key), 1), 30000);
                        await message.channel.sendMessage((config.wordlistAction.message || WORDLIST_DEFAULT_MESSAGE)
                            .replaceAll('{{user_id}}', message.authorId!));
                    }
                }
            }
            case 'LOG':
            default: {
                if (!config.logs?.modAction) break;
                await sendLogMessage(config.logs.modAction, {
                    title: 'Message triggered word filter',
                    description: `**Author:** @${message.author?.username} (${message.authorId})\n` +
                        `**Action:** ${config.wordlistAction?.action || 'LOG'}\n` +
                        `#### Content\n` +
                        `>${sanitizeMessageContent(message.content.substring(0, 1000)).trim().replace(/\n/g, '\n>')}`,
                    color: '#ff557f',
                });
            }

        }
    } catch(e) {
        console.error(e);
    }
}

function checkMessageForFilteredWords(message: string, config: ServerConfig): boolean {
    if (!config.wordlistEnabled || !config.wordlist?.length || !message) return false;

    const words = {
        soft: config.wordlist.filter(w => w.strictness == 'SOFT').map(w => w.word),
        hard: config.wordlist.filter(w => w.strictness == 'HARD').map(w => w.word),
        strict: config.wordlist.filter(w => w.strictness == 'STRICT').map(w => w.word),
    }

    const softSegments = message.split(/\s/g).map(s => s.toLowerCase());
    for (const word of words.soft) {
        if (softSegments.includes(word.toLowerCase())) return true;
    }

    for (const word of words.hard) {
        if (message.toLowerCase().includes(word.toLowerCase())) return true;
    }

    const replace = {
        '0': 'o',
        '1': 'i',
        '4': 'a',
        '3': 'e',
        '5': 's',
        '6': 'g',
        '7': 't',
        '8': 'b',
        '9': 'g',
        '@': 'a',
        '^': 'a',
        'Д': 'a',
        'ß': 'b',
        '¢': 'c',
        '©': 'c',
        '<': 'c',
        '€': 'e',
        'ƒ': 'f',
        'ท': 'n',
        'И': 'n',
        'Ø': 'o',
        'Я': 'r',
        '®': 'r',
        '$': 's',
        '§': 's',
        '†': 't',
        'บ': 'u',
        'พ': 'w',
        '₩': 'w',
        '×': 'x',
        '¥': 'y',
    }
    const replaceChars = (input: string) => {
        input = `${input}`;
        for (const pair of Object.entries(replace)) {
            input = input.replaceAll(pair[0], pair[1]);
        }
        return input;
    }
    const replacedMsg = replaceChars(message.toLowerCase().replace(/\s/g, ''));
    for (const word of words.strict) {
        if (replacedMsg.includes(replaceChars(word.toLowerCase()))) return true;
    }

    return false;
}

// Scan all servers for the `discoverable` flag and notify their owners that antispam is forcefully enabled
const notifyPublicServers = async () => {
    logger.info('Sending antispam notification to public servers');

    const servers = Array.from(client.servers.values())
        .filter(server => server.discoverable);

    const res = await dbs.SERVERS.find({
        id: { $in: servers.map(s => s.id) },
        discoverAutospamNotify: { $in: [ undefined, false ] },
    });

    res.forEach(async (serverConfig) => {
        try {
            logger.info(`Sending notification to owner of server ${serverConfig.id}`);

            await dbs.SERVERS.update(
                { id: serverConfig.id },
                { $set: { discoverAutospamNotify: true, antispamEnabled: true, allowBlacklistedUsers: false } },
            );

            const server = client.servers.get(serverConfig.id);
            const channel = await getDmChannel(server!.ownerId);
            await channel.sendMessage(`Hi there,

It looks like your server, **${sanitizeMessageContent(server!.name).trim()}**, has been added to server discovery. Congratulations!

In order to keep Revolt free of spam, AutoMod enables spam protection by default on public servers.
You are receiving this message to inform you that said features have been enabled automatically in your server.

Please ensure that AutoMod has appropriate permissions to kick and ban users.
You may also want to set up a logging channel by running \`/botctl logs modaction #yourchannel\` to receive details about antispam events if you haven't done so already.

Thanks for being part of Revolt!`);
        } catch(e) {
            console.error(e);
        }
    });
}

awaitClient().then(() => notifyPublicServers());

export { antispam, wordFilterCheck, checkMessageForFilteredWords }
