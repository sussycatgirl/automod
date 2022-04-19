import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { AUTUMN_URL, client } from "./client";
import { MessageEmbed, MessagePayload, WebhookClient, WebhookMessageOptions } from "discord.js";
import GenericEmbed from "../types/GenericEmbed";
import { SendableEmbed } from "revolt-api";
import { clipText, discordFetchMessage } from "../util";

client.on('message/delete', async id => {
    try {
        logger.debug(`[D] Revolt: ${id}`);

        const bridgedMsg = await BRIDGED_MESSAGES.findOne({ "revolt.messageId": id });
        if (!bridgedMsg?.discord.messageId) return logger.debug(`Revolt: Message has not been bridged; ignoring delete`);
        if (!bridgedMsg.channels?.discord) return logger.debug(`Revolt: Channel for deleted message is unknown`);

        const bridgeCfg = await BRIDGE_CONFIG.findOne({ revolt: bridgedMsg.channels.revolt });
        if (!bridgeCfg?.discordWebhook) return logger.debug(`Revolt: No Discord webhook stored`);
        if (!bridgeCfg.discord || bridgeCfg.discord != bridgedMsg.channels.discord) {
            return logger.debug(`Revolt: Discord channel is no longer linked; ignoring delete`);
        }

        const targetMsg = await discordFetchMessage(bridgedMsg.discord.messageId, bridgeCfg.discord);
        if (!targetMsg) return logger.debug(`Revolt: Could not fetch message from Discord`);

        if (targetMsg.webhookId && targetMsg.webhookId == bridgeCfg.discordWebhook.id) {
            const client = new WebhookClient({ id: bridgeCfg.discordWebhook.id, token: bridgeCfg.discordWebhook.token });
            await client.deleteMessage(bridgedMsg.discord.messageId);
            client.destroy();
        } else if (targetMsg.deletable) {
            targetMsg.delete();
        } else logger.debug(`Revolt: Unable to delete Discord message`);
    } catch(e) {
        console.error(e);
    }
});

client.on('message/update', async message => {
    if (message.content && typeof message.content != 'string') return;
    if (message.author_id == client.user?._id) return;

    try {
        logger.debug(`[E] Revolt: ${message.content}`);

        const [ bridgeCfg, bridgedMsg ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ revolt: message.channel_id }),
            BRIDGED_MESSAGES.findOne({ "revolt.nonce": message.nonce }),
        ]);

        if (!bridgedMsg) return logger.debug(`Revolt: Message has not been bridged; ignoring edit`);
        if (!bridgeCfg?.discord) return logger.debug(`Revolt: No Discord channel associated`);
        if (!bridgeCfg.discordWebhook) return logger.debug(`Revolt: No Discord webhook stored`);

        const targetMsg = await discordFetchMessage(bridgedMsg.discord.messageId, bridgeCfg.discord);
        if (!targetMsg) return logger.debug(`Revolt: Could not fetch message from Discord`);

        const client = new WebhookClient({ id: bridgeCfg.discordWebhook.id, token: bridgeCfg.discordWebhook.token });
        await client.editMessage(targetMsg, { content: message.content, allowedMentions: { parse: [ ] } });
        client.destroy();
    } catch(e) { console.error(e) }
});

client.on('message', async message => {
    try {
        if (message.content && typeof message.content != 'string') return;
        logger.debug(`[M] Revolt: ${message.content}`);

        const [ bridgeCfg, bridgedMsg, ...repliedMessages ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ revolt: message.channel_id }),
            BRIDGED_MESSAGES.findOne({ "revolt.nonce": message.nonce }),
            ...(message.reply_ids?.map(id => BRIDGED_MESSAGES.findOne({ "revolt.messageId": id })) ?? [])
        ]);

        if (bridgedMsg) return logger.debug(`Revolt: Message has already been bridged; ignoring`);
        if (!bridgeCfg?.discord) return logger.debug(`Revolt: No Discord channel associated`);
        if (!bridgeCfg.discordWebhook) {
            // Todo: Create a new webhook instead of exiting
            return logger.debug(`Revolt: No Discord webhook stored`);
        }

        await BRIDGED_MESSAGES.update(
            { 'revolt.messageId': message._id },
            {
                $set: {
                    revolt: {
                        messageId: message._id,
                        nonce: message.nonce,
                    },
                    channels: {
                        revolt: message.channel_id,
                        discord: bridgeCfg.discord,
                    }
                },
                $setOnInsert: {
                    discord: {},
                    origin: 'revolt',
                }
            },
            { upsert: true }
        );

        const client = new WebhookClient({
            id: bridgeCfg.discordWebhook.id,
            token: bridgeCfg.discordWebhook.token,
        });

        const payload: MessagePayload|WebhookMessageOptions = {
            content: message.content || undefined,
            username: message.author?.username ?? 'Unknown user',
            avatarURL: message.author?.generateAvatarURL({ max_side: 128 }),
            embeds: message.embeds?.length
                ? message.embeds
                    .filter(e => e.type == "Text")
                    .map(e => new GenericEmbed(e as SendableEmbed).toDiscord())
                : undefined,
            allowedMentions: { parse: [ ] },
        };

        if (repliedMessages.length) {
            const embed = new MessageEmbed().setColor('#2f3136');

            if (repliedMessages.length == 1) {
                const replyMsg = await discordFetchMessage(repliedMessages[0]?.discord.messageId, bridgeCfg.discord);
                const author = replyMsg?.author;

                embed.setAuthor({
                    name: `@${author?.username ?? 'Unknown'}`, // todo: check if @pinging was enabled for reply
                    iconURL: author?.displayAvatarURL({ size: 64, dynamic: true }),
                    url: replyMsg?.url,
                });

                if (replyMsg?.content) embed.setDescription('>>> ' + clipText(replyMsg.content, 200));
            } else {
                const replyMsgs = await Promise.all(
                    repliedMessages.map(m => discordFetchMessage(m?.discord.messageId, bridgeCfg.discord))
                );

                embed.setAuthor({ name: repliedMessages.length + ' replies' });

                for (const msg of replyMsgs) {
                    embed.addField(
                        `@${msg?.author.username ?? 'Unknown'}`,
                        (msg ? `[Link](${msg.url})\n` : '') +
                            '>>> ' + clipText(msg?.content ?? '\u200b', 100),
                        true,
                    );
                }
            }

            if (payload.embeds) payload.embeds.unshift(embed);
            else payload.embeds = [ embed ];
        }

        if (message.attachments?.length) {
            payload.files = [];

            for (const attachment of message.attachments) {
                payload.files.push({
                    attachment: `${AUTUMN_URL}/attachments/${attachment._id}/${attachment.filename}`,
                    name: attachment.filename,
                });
            }
        }

        client.send(payload)
        .then(async res => {
            await BRIDGED_MESSAGES.update({
                "revolt.messageId": message._id
            }, {
                $set: {
                    "discord.messageId": res.id
                }
            });
        })
        .catch(async e => {
            console.error('Failed to execute webhook', e?.response?.data ?? e);
        });
    } catch(e) {
        console.error(e);
    }
});
