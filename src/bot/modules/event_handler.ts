import { ulid } from "ulid";
import { client } from "../..";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import { storeInfraction } from "../util";

// Listen to system messages
client.on('message', message => {
    if (typeof message.content != 'object') return;

    let sysMsg = message.asSystemMessage;
    
    switch(sysMsg.type) {
        case 'user_kicked':
        case 'user_banned':
            if (message.channel &&
                sysMsg.user &&
                sysMsg.by &&
                sysMsg.by._id != client.user?._id) return;

            storeInfraction({
                _id: ulid(),
                createdBy: sysMsg.by?._id,
                reason: 'Unknown reason (caught system message)',
                date: message.createdAt,
                server: message.channel!.server_id,
                type: InfractionType.Manual,
                user: sysMsg.user!._id,
                actionType: sysMsg.type == 'user_kicked' ? 'kick' : 'ban',
            } as Infraction).catch(console.warn);
        break;
        case 'user_joined': break;
        case 'user_left'  : break;
    }
});
