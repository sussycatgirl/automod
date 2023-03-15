import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { ulid } from "ulid";
import { client, dbs } from "../..";
import AntispamRule from "automod/dist/types/antispam/AntispamRule";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import ModerationAction from "automod/dist/types/antispam/ModerationAction";
import logger from "../logger";
import { awaitClient, isModerator, storeInfraction } from "../util";
import { getDmChannel, sanitizeMessageContent } from "../util";

let msgCountStore: Map<string, { users: any }> = new Map();

/**
 * 
 * @param message 
 * @returns true if ok, false if spam rule triggered
 */
async function antispam(message: Message): Promise<boolean> {
    try {
        let serverRules = await dbs.SERVERS.findOne({ id: message.channel!.server_id! });
        if (!serverRules?.automodSettings) return true;

        let ruleTriggered = false;

        for (const rule of serverRules.automodSettings.spam) {
            if (msgCountStore.get(rule.id) == null) {
                msgCountStore.set(rule.id, { users: {} });
            }

            if (message.author?.bot != null) break;
            if (serverRules.whitelist?.users?.includes(message.author_id)) break;
            if (message.member?.roles?.filter(r => serverRules!.whitelist?.roles?.includes(r)).length) break;
            if (serverRules.whitelist?.managers !== false && await isModerator(message, false)) break;
            if (rule.channels?.length && rule.channels.indexOf(message.channel_id) == -1) break;

            let store = msgCountStore.get(rule.id)!;
            if (!store.users[message.channel_id]) store.users[message.channel_id] = {}
            let userStore = store.users[message.channel_id];

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
                                server: message.channel?.server_id,
                                type: InfractionType.Automatic,
                                user: message.author_id,
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
            .replace(new RegExp('{{userid}}', 'gi'), message.author_id);
    } else return `<@${message.author_id}>, please stop spamming.`;
}

// Scan all servers for the `discoverable` flag and notify their owners that antispam is forcefully enabled
const notifyPublicServers = async () => {
    logger.info('Sending antispam notification to public servers');

    const servers = Array.from(client.servers.values())
        .filter(server => server.discoverable);

    const res = await dbs.SERVERS.find({
        id: { $in: servers.map(s => s._id) },
        discoverAutospamNotify: { $in: [ undefined, false ] },
    });

    res.forEach(async (serverConfig) => {
        try {
            logger.info(`Sending notification to owner of server ${serverConfig._id}`);

            const server = client.servers.get(serverConfig.id);
            const channel = await getDmChannel(server!.owner);
            await channel.sendMessage(`Hi there,

It looks like your server, **${sanitizeMessageContent(server!.name).trim()}**, has been added to server discovery. Congratulations!

In order to keep Revolt free of spam, AutoMod enables spam protection by default on public servers.
You are receiving this message to inform you that said features have been enabled automatically in your server.

Please ensure that AutoMod has appropriate permissions to kick and ban users.
You may also want to set up a logging channel by running \`/botctl logs modaction #yourchannel\` to receive details about antispam events if you haven't done so already.

Thanks for being part of Revolt!`);

            await dbs.SERVERS.update(
                { id: serverConfig.id },
                { $set: { discoverAutospamNotify: true, antispamEnabled: true, allowBlacklistedUsers: false } },
            );
        } catch(e) {
            console.error(e);
        }
    });
}

awaitClient().then(() => notifyPublicServers());

export { antispam }
