import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import CustomRuleAction from "automod/dist/types/antispam/CustomRuleAction";
import { storeInfraction } from '../../../util';
import Infraction from "automod/dist/types/antispam/Infraction";
import { ulid } from "ulid";
import InfractionType from "automod/dist/types/antispam/InfractionType";

async function execute(message: Message, action: CustomRuleAction) {
    let warnMsg = action.text
        ? `${action.text}\n(Triggered on ${message.channel_id} / ${message._id})`
        : `Moderation rule triggered on ${message.channel_id} / ${message._id}`;
    
    let infraction: Infraction = {
        _id: ulid(),
        date: Date.now(),
        createdBy: null,
        reason: warnMsg,
        server: message.channel?.server_id!,
        type: InfractionType.Automatic,
        user: message.author_id
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
