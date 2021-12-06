class CustomRuleTrigger {
    _id: string;

    // Which events this rule should apply to
    // todo: message/update is not implemented
    on: ('message/create' | 'message/update')[];

    // Regex or string to match the content of the message against. If omitted, rule applies to every message
    matcher?: RegExp|string;

    userFilter?: 'user' | 'bot' | 'any';

    // The minimum delay between rule matches. If omitted, rule matches every message
    timeout?: {
        perUser?: number;
        perChannel?: number;
        global?: number; // "Global" is per-server
    };
}

export default CustomRuleTrigger;