import axios from "axios";
import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { client } from "./client";
import { client as discordClient } from "../discord/client";
import { WebhookClient } from "discord.js";

client.on('message', async message => {
    try {
        if (!message.content || typeof message.content != 'string') return;
        logger.debug(`[M] Revolt: ${message.content}`);

        const [ bridgeCfg, bridgedMsg, ...repliedMessages ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ revolt: message.channel_id }),
            BRIDGED_MESSAGES.findOne({ "revolt.nonce": message.nonce }),
            //...(message.reply_ids?.map(id => BRIDGED_MESSAGES.findOne({ "revolt.messageId": id })) ?? [])
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

        client.send({
            content: `${message.content}`,
            username: message.author?.username ?? 'Unknown user',
            avatarURL: message.author?.generateAvatarURL({ max_side: 128 }),
        })
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
