import { Message } from "revolt.js/dist/maps/Messages";
import { client } from "../../../..";
import CustomRuleAction from "../../../../struct/antispam/CustomRuleAction";

async function execute(message: Message, action: CustomRuleAction) {
    let text = action.text || "Error: No text specified for `sendMessage` action";
    if (text.length > 2000) {
        text = text.slice(0, 1996) + ' ...';
    }

    if (!message.channel) await client.channels.fetch(message.channel_id);
    let msg = await message.channel!.sendMessage(text);

    if (action.duration) {
        setTimeout(() => {
            msg.delete()
                .catch(console.warn);
        }, action.duration * 1000);
    }
}

export default execute;
