import { Message } from "revolt.js/dist/maps/Messages";
import { ulid } from "ulid";
import { client } from "../..";
import AntispamRule from "../../struct/antispam/AntispamRule";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import ModerationAction from "../../struct/antispam/ModerationAction";
import ServerConfig from "../../struct/ServerConfig";
import logger from "../logger";
import { isBotManager, isModerator, storeInfraction } from "../util";

let msgCountStore: Map<string, { users: any }> = new Map();

/**
 * 
 * @param message 
 * @returns true if ok, false if spam rule triggered
 */
async function antispam(message: Message): Promise<boolean> {
    let serverRules: ServerConfig = await client.db.get('servers').findOne({ id: message.channel?.server_id }) ?? {};
    if (!serverRules.automodSettings) return true;

    let ruleTriggered = false;

    for (const rule of serverRules.automodSettings.spam) {
        if (msgCountStore.get(rule.id) == null) {
            msgCountStore.set(rule.id, { users: {} });
        }

        if (message.author?.bot != null) break;
        if (serverRules.whitelist?.users?.includes(message.author_id)) break;
        if (message.member?.roles?.filter(r => serverRules.whitelist?.roles?.includes(r)).length) break;
        if (serverRules.whitelist?.managers !== false && await isModerator(message.member!)) break;
        if (rule.channels?.indexOf(message.channel_id) == -1) break;

        let store = msgCountStore.get(rule.id)!;
        if (!store.users[message.channel_id]) store.users[message.channel_id] = {}
        let userStore = store.users[message.channel_id];

        if (!userStore.count) userStore.count = 1;
        else userStore.count++;

        setTimeout(() => userStore.count--, rule.timeframe * 1000);

        if (userStore.count > rule.max_msg) {
            logger.info(`Antispam rule triggered: ${rule.max_msg}/${rule.timeframe} -> ${ModerationAction[rule.action]}`);
            ruleTriggered = true;

            switch(rule.action) {
                case ModerationAction.Delete:
                    message.delete()
                        .catch(() => logger.warn('Antispam: Failed to delete message') );
                break;
                case ModerationAction.Message:
                    if (!userStore.warnTriggered) {
                        userStore.warnTriggered = true;
                        setTimeout(() => userStore.warnTriggered = false, 5000);
                        message.channel?.sendMessage(getWarnMsg(rule, message));
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

                        let m = message.channel?.sendMessage('## User has been warned.\n\u200b\n' + getWarnMsg(rule, message));

                        await storeInfraction(inf);
                    }
                break;
                case ModerationAction.Kick:
                    message.reply('(Kick user)');
                break;
                case ModerationAction.Ban:
                    message.reply('(Ban user)');
                break;
            }
        }
    }
    
    return !ruleTriggered;
}

function getWarnMsg(rule: AntispamRule, message: Message) {
    if (rule.message != null) {
        return rule.message
            .replace(new RegExp('{{userid}}', 'gi'), message.author_id);
    } else return `<@${message.author_id}>, please stop spamming.`;
}

export { antispam }
