import { ulid } from "ulid";
import { client } from "../..";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import { storeInfraction } from "../util";

// Listen to system messages
client.on('message', async message => {
    if (typeof message.content != 'object') return;

    let sysMsg = message.asSystemMessage;
    
    switch(sysMsg.type) {
        case 'user_kicked':
        case 'user_banned':
            try {
                let recentEvents = await client.db.get('infractions').findOne({
                    date: { $gt: Date.now() - 30000 },
                    user: sysMsg.user?._id,
                    server: message.channel?.server_id,
                    actionType: sysMsg.type == 'user_kicked' ? 'kick' : 'ban',
                });

                if (!message.channel ||
                    !sysMsg.user ||
                    recentEvents) return;

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
            } catch(e) { console.error(e) }
        break;
        case 'user_joined': break;
        case 'user_left'  : break;
    }
});
