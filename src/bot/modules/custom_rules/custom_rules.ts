import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { client } from "../../..";
import ServerConfig from "../../../struct/ServerConfig";
import logger from "../../logger";
import messageContentTrigger from "./message_content_trigger";

import custom_sendMessage from "./actions/sendMessage";
import custom_delete from "./actions/delete";
import custom_warn from "./actions/warn";

async function checkCustomRules(message: Message, isEdit: boolean = false) {
    let serverConfig: ServerConfig = await client.db.get('servers').findOne({ id: message.channel?.server_id }) ?? {};
    let rules = serverConfig?.automodSettings?.custom;
    if (!rules) return;

    for (let rule of rules) {
        let onEdit = rule.trigger.on.includes('message/update');
        let onNew  = rule.trigger.on.includes('message/create');

        // tired
        if (!((onEdit && isEdit) || (onNew && !isEdit) || (onNew && onEdit))) break;

        if (await messageContentTrigger(message, rule.trigger)) {
            for (const action of rule.action) {
                switch(action.action) {
                    case 'sendMessage':
                        await custom_sendMessage(message, action);
                    break;
                    case 'delete':
                        await custom_delete(message, action);
                    break;
                    case 'warn':
                        await custom_warn(message, action);
                    break;
                    default:
                        logger.warn(`Unknown action ${action.action} in custom rule ${rule._id} in server ${message.channel?.server_id}`);
                }
            }
        }
    }
}

export default checkCustomRules;
