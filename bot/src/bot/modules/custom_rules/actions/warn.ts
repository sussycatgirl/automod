import { Message } from "revolt.js";
import CustomRuleAction from "automod/dist/types/antispam/CustomRuleAction";
import { storeInfraction } from '../../../util';
import Infraction from "automod/dist/types/antispam/Infraction";
import { ulid } from "ulid";
import InfractionType from "automod/dist/types/antispam/InfractionType";

async function execute(message: Message, action: CustomRuleAction) {
    let warnMsg = action.text
        ? `${action.text}\n(Triggered on ${message.channelId} / ${message.id})`
        : `Moderation rule triggered on ${message.channelId} / ${message.id}`;
    
    let infraction: Infraction = {
        _id: ulid(),
        date: Date.now(),
        createdBy: null,
        reason: warnMsg,
        server: message.channel?.serverId!,
        type: InfractionType.Automatic,
        user: message.authorId!,
    }

    let { userWarnCount } = await storeInfraction(infraction);

    if (action.silent !== true) {
        message.channel?.sendMessage(
            `### User has been warned\n` +
            `This is warn number \`${userWarnCount}\` for @${message.author?.username}.\n` +
            `**Reason:** ${warnMsg}`
        ).catch(console.warn);
    }
}

export default execute;
