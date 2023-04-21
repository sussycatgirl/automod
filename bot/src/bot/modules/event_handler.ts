import { ulid } from "ulid";
import crypto from "crypto";
import { client, dbs } from "../..";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import { BLACKLIST_BAN_REASON, BLACKLIST_MESSAGE } from "../commands/admin/botadm";
import logger from "../logger";
import { storeInfraction } from "../util";
import { DEFAULT_PREFIX } from "./command_handler";
import { SendableEmbed } from "revolt-api";

const DM_SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 30;

// Listen to system messages
client.on('messageCreate', async message => {

    let sysMsg = message.systemMessage;

    if (sysMsg) switch(sysMsg.type) {
        case 'user_kicked':
        case 'user_banned':
            try {
                let recentEvents = await dbs.INFRACTIONS.findOne({
                    date: { $gt: Date.now() - 30000 },
                    user: sysMsg.id,
                    server: message.channel!.serverId!,
                    actionType: sysMsg.type == 'user_kicked' ? 'kick' : 'ban',
                });

                if (!message.channel ||
                    !sysMsg.id ||
                    recentEvents) return;

                storeInfraction({
                    _id: ulid(),
                    createdBy: null,
                    reason: 'Unknown reason (caught system message)',
                    date: message.createdAt.getTime(),
                    server: message.channel!.serverId,
                    type: InfractionType.Manual,
                    user: sysMsg.id,
                    actionType: sysMsg.type == 'user_kicked' ? 'kick' : 'ban',
                } as Infraction).catch(console.warn);
            } catch(e) { console.error(e) }
        break;
        case 'user_joined': {
            try {
                const [ serverConfig, userConfig ] = await Promise.all([
                    dbs.SERVERS.findOne({ id: message.channel!.serverId }),
                    dbs.USERS.findOne({ id: sysMsg.id }),
                ]);

                if (userConfig?.globalBlacklist && !serverConfig?.allowBlacklistedUsers) {
                    const server = message.channel?.server;
                    if (server && server.havePermission('BanMembers')) {
                        await server.banUser(sysMsg.id, { reason: BLACKLIST_BAN_REASON });

                        if (server.systemMessages?.user_banned) {
                            const channel = server.channels.find(c => c?.id == server.systemMessages?.user_banned);
                            if (channel && channel.havePermission('SendMessage')) {
                                const user = client.users.get(sysMsg.id);
                                await channel.sendMessage(BLACKLIST_MESSAGE(user?.username ?? sysMsg.id));
                            }
                        }
                    }
                }
            } catch(e) {
                console.error(''+e);
            }

            break;
        };
        case 'user_left'  : break;
    }
});

// DM message based API session token retrieval
client.on('messageCreate', async message => {
    try {
        if (
            message.channel?.type == "DirectMessage" &&
            message.nonce?.startsWith("REQUEST_SESSION_TOKEN-") &&
            message.content?.toLowerCase().startsWith("requesting session token.")
        ) {
            logger.info('Received session token request in DMs.');
        
            const token = crypto.randomBytes(48).toString('base64').replace(/=/g, '');
        
            await client.db.get('sessions').insert({
                user: message.authorId,
                token: token,
                nonce: message.nonce,
                invalid: false,
                expires: Date.now() + DM_SESSION_LIFETIME,
            })

            await message.channel.sendMessage({
                content: `Token request granted. **Do not send the content of this message to anyone!**\n$%${token}%$`,
                replies: [ { id: message.id, mention: false } ],
            });
            return;
        }
    } catch(e) {
        console.error(e);
    }
});

// Send a message when added to a server
client.on('serverMemberJoin', (member) => {
    if (member.id.user != client.user?.id) return;

    if (!member.server) return;

    const embed: SendableEmbed = {
        title: 'Hi there, thanks for adding me!',
        description: `My prefix is "${DEFAULT_PREFIX}", but you can also @mention me instead.\nCheck out ${DEFAULT_PREFIX}help to get started!`,
        icon_url: client.user.avatarURL,
        colour: '#ff6e6d',
        url: `/bot/${client.user.id}`,
    }

    let channels = member.server.channels.filter(
        c => c
         && c.type == 'TextChannel'
         && member.hasPermission(c, 'SendMessage')
         && member.hasPermission(c, 'SendEmbeds')
    );

    // Attempt to find an appropriate channel, otherwise use the first one available
    let channel = channels.find(c => c?.name?.toLowerCase() == 'welcome')
               || channels.find(c => c?.name?.toLowerCase() == 'general')
               || channels.find(c => c?.name?.toLowerCase() == 'bots')
               || channels.find(c => c?.name?.toLowerCase() == 'spam')
               || channels[0];

    if (!channel) return logger.debug('Cannot send hello message: No suitable channel found');
    channel.sendMessage({
        content: `:wave: "Hi there!")`,
        embeds: [embed],
    }).catch(e => logger.debug('Cannot send hello message: ' + e));
});

client.on('disconnected', () => logger.warn('Client disconnected!'));

client.events.on('state', (state) => {
    switch(state) {
        case 2:
            logger.info('Connection state: Connected');
            break;
        case 1:
            logger.info('Connection state: Connecting');
            break;
        case 3:
            logger.info('Connection state: Disconnected');
            break;
        case 0:
            logger.info('Connection state: Idle');
            break;
    }
});
