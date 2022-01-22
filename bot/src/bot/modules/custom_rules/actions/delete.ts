import { Message } from "revolt.js/dist/maps/Messages";
import CustomRuleAction from "../../../../struct/antispam/CustomRuleAction";

async function execute(message: Message, action: CustomRuleAction) {
    setTimeout(() => message.delete().catch(console.warn), (action.duration ?? 0) * 1000);
}

export default execute;
