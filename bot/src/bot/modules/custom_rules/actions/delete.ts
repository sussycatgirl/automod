import { Message } from "revolt.js";
import CustomRuleAction from "automod/dist/types/antispam/CustomRuleAction";

async function execute(message: Message, action: CustomRuleAction) {
    setTimeout(() => message.delete().catch(console.warn), (action.duration ?? 0) * 1000);
}

export default execute;
