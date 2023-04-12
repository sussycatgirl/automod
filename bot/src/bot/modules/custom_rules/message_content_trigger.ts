import { Message } from "revolt.js";
import { client } from "../../..";
import CustomRuleTrigger from "automod/dist/types/antispam/CustomRuleTrigger";
import VM from 'vm';

let ruleTimeouts: Map<string, number> = new Map();

async function messageContentTrigger(message: Message, trigger: CustomRuleTrigger): Promise<boolean> {

    /* Match message content */

    let matched = false;
    if (trigger.matcher) {
        if (trigger.channelFilter) {
            if (trigger.channelFilter.mode == 'WHITELIST' && !trigger.channelFilter.channels.includes(message.channelId)) return false;
            if (trigger.channelFilter.mode == 'BLACKLIST' &&  trigger.channelFilter.channels.includes(message.channelId)) return false;
        }

        if (trigger.matcher instanceof RegExp) {
            /**
             * Since users will eventually be able to provide regexes, we need to protect
             * againt ReDoS (Regular Expression Denial of Service).
             * Therefore all RegExes will have an execution limit of 2ms.
             * An additional mitigation step would be to disable rules that are frequently
             * found to hit that limit, but that is out of scope for now.
             * 
             * (If someone finds a flaw in my logic, please report it)
            */

            // We use node's built-in `vm` module to limit execution time.
            // No idea if this works the way I want it to
            try {
                let ctx = VM.createContext({
                    regex: trigger.matcher!,
                    matchedStrings: [],
                    content: message.content as string,
                });

                let script = new VM.Script('matchedStrings = content.match(regex);', { timeout: 2 });
                script.runInContext(ctx);

                if (ctx.matchedStrings?.length) matched = true;
            } catch(e) {
                console.error('Exception thrown while parsing RegEx: ' + e);
            }

        } else {
            if ((message.content as string).includes(trigger.matcher)) matched = true;
        }
    }
    if (!matched) return false;


    /* Timeouts */

    let timeoutKeys = {
        global:  trigger._id,
        channel: trigger._id + '/channel/' + message.channelId,
        user:    trigger._id + '/user/' + message.authorId,
    }
    let timeoutPass = true;

    // Global
    if (trigger.timeout?.global && ruleTimeouts.has(timeoutKeys.global)) {
        if (ruleTimeouts.get(timeoutKeys.global)! + (trigger.timeout.global * 1000) < Date.now()) {
            ruleTimeouts.set(timeoutKeys.global, Date.now());
        } else timeoutPass = false;
    }

    // Per Channel
    if (trigger.timeout?.perChannel && ruleTimeouts.has(timeoutKeys.channel)) {
        if (ruleTimeouts.get(timeoutKeys.channel)! + (trigger.timeout.perChannel * 1000) < Date.now()) {
            ruleTimeouts.set(timeoutKeys.channel, Date.now());
        } else timeoutPass = false;
    }

    // Per User
    if (trigger.timeout?.perUser && ruleTimeouts.has(timeoutKeys.user)) {
        if (ruleTimeouts.get(timeoutKeys.user)! + (trigger.timeout.perUser * 1000) < Date.now()) {
            ruleTimeouts.set(timeoutKeys.user, Date.now());
        } else timeoutPass = false;
    }

    if (!timeoutPass) return false;


    /* User/bot filter comes last because we want to avoid fetching users if possible */

    if (trigger.userFilter && trigger.userFilter != 'any') {
        let user = message.author || await client.users.fetch(message.authorId!);
        if (trigger.userFilter == 'bot' && !user.bot) return false;
        if (trigger.userFilter == 'user' && user.bot) return false;
    }

    return true;
}

export default messageContentTrigger;
