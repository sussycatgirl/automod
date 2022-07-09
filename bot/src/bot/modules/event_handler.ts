import { ulid } from "ulid";
import crypto from "crypto";
import { client, dbs } from "../..";
import Infraction from "automod/types/antispam/Infraction";
import InfractionType from "automod/types/antispam/InfractionType";
import { BLACKLIST_BAN_REASON, BLACKLIST_MESSAGE } from "../commands/admin/botadm";
import logger from "../logger";
import { hasPermForChannel, storeInfraction } from "../util";
import { DEFAULT_PREFIX } from "./command_handler";

const DM_SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 30;

// Listen to system messages
client.on('message', async message => {
    if (typeof message.content != 'object') {
        // reply to 74
        if (message.author_id == '01FCXF8V6RDKHSQ3AHJ410AASX' && message.content == 'we do a little') {
            try {
                message.reply('shut the fuck up');
            } catch(e) { console.error(e) }
        }

        return;
    }

    let sysMsg = message.asSystemMessage;

    switch(sysMsg.type) {
        case 'user_kicked':
        case 'user_banned':
            try {
                let recentEvents = await dbs.INFRACTIONS.findOne({
                    date: { $gt: Date.now() - 30000 },
                    user: sysMsg.user?._id,
                    server: message.channel!.server_id!,
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
        case 'user_joined': {
            if (!sysMsg.user) break;

            try {
                const [ serverConfig, userConfig ] = await Promise.all([
                    dbs.SERVERS.findOne({ id: message.channel!.server_id! }),
                    dbs.USERS.findOne({ id: sysMsg.user._id }),
                ]);

                if (userConfig?.globalBlacklist && !serverConfig?.allowBlacklistedUsers) {
                    const server = message.channel?.server;
                    if (server && server.havePermission('BanMembers')) {
                        await server.banUser(sysMsg.user._id, { reason: BLACKLIST_BAN_REASON });

                        if (server.system_messages?.user_banned) {
                            const channel = server.channels.find(c => c?._id == server.system_messages?.user_banned);
                            if (channel && channel.havePermission('SendMessage')) {
                                await channel.sendMessage(BLACKLIST_MESSAGE(sysMsg.user.username));
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
client.on('message', async message => {
    try {
        if (
            message.channel?.channel_type == "DirectMessage" &&
            message.nonce?.startsWith("REQUEST_SESSION_TOKEN-") &&
            message.content?.toLowerCase().startsWith("requesting session token.")
        ) {
            logger.info('Received session token request in DMs.');
        
            const token = crypto.randomBytes(48).toString('base64').replace(/=/g, '');
        
            await client.db.get('sessions').insert({
                user: message.author_id,
                token: token,
                nonce: message.nonce,
                invalid: false,
                expires: Date.now() + DM_SESSION_LIFETIME,
            })

            // Don't need to risk exposing the user to the token, so we'll send it in the nonce
            await message.channel.sendMessage({
                content: 'Token request granted.',
                nonce: `${ulid()}; TOKEN:${token}`,
                replies: [ { id: message._id, mention: false } ],
            });
            return;
        }
    } catch(e) {
        console.error(e);
    }
});

// Send a message when added to a server
client.on('member/join', (member) => {
    if (member._id.user != client.user?._id) return;

    let url = `https://rvembed.janderedev.xyz/embed`
            + `?title=${encodeURIComponent('Hi there, thanks for adding me!')}`
            + `&description=${encodeURIComponent(`My prefix is "${DEFAULT_PREFIX}", `
                + `but you can also @mention me instead.\nCheck out ${DEFAULT_PREFIX}help to get started!`)}`
            + `&link=${encodeURIComponent(`/bot/${client.user._id}`)}`
            + `&redir=${encodeURIComponent(`https://github.com/janderedev/revolt-automod`)}`
            + `&color=${encodeURIComponent("#ff6e6d")}`
            + `&image=${encodeURIComponent(client.user.generateAvatarURL({ size: 128 }))}`
            + `&image_large=false`;

    if (!member.server) return;

    let channels = member.server.channels.filter(
        c => c
         && c.channel_type == 'TextChannel'
         && hasPermForChannel(member, c, 'SendMessage')
         && hasPermForChannel(member, c, 'SendEmbeds')
    );

    // Attempt to find an appropriate channel, otherwise use the first one available
    let channel = channels.find(c => c?.name?.toLowerCase() == 'welcome')
               || channels.find(c => c?.name?.toLowerCase() == 'general')
               || channels.find(c => c?.name?.toLowerCase() == 'bots')
               || channels.find(c => c?.name?.toLowerCase() == 'spam')
               || channels[0];

    if (!channel) return logger.debug('Cannot send hello message: No suitable channel found');
    channel.sendMessage(`[:wave:](${url} "Hi there!")`)
        .catch(e => logger.debug('Cannot send hello message: ' + e));
});
