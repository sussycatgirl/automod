import CustomRuleAction from "./CustomRuleAction";
import CustomRuleTrigger from "./CustomRuleTrigger";

class CustomRule {
    _id: string;
    trigger: CustomRuleTrigger;
    action: CustomRuleAction[];
}

export default CustomRule;
