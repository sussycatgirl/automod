import axios from "axios";
import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { client } from "./client";
import { client as discordClient } from "../discord/client";

client.on('message', async message => {
    try {
        logger.debug(`[M] Revolt: ${message.content}`);

        const [ bridgedMsg, bridgeCfg ] = await Promise.all([
            BRIDGED_MESSAGES.findOne({ "revolt.messageId": message._id }),
            BRIDGE_CONFIG.findOne({ revolt: message.channel_id }),
        ]);

        if (bridgedMsg) return logger.debug(`Revolt: Message has already been bridged; ignoring`);
        if (!bridgeCfg?.discord) return logger.debug(`Revolt: No Discord channel associated`);
        if (!bridgeCfg.discordWebhook) {
            // Todo: Create a new webhook instead of exiting
            return logger.debug(`Revolt: No Discord webhook stored`);
        }

        await BRIDGED_MESSAGES.insert({
            origin: 'revolt',
            discord: {},
            revolt: {
                messageId: message._id,
            },
        });

        axios.post(
            `https://discord.com/api/v9/webhooks/${bridgeCfg.discordWebhook.id}/${bridgeCfg.discordWebhook.token}?wait=true`,
            {
                content: message.content,
                username: message.author?.username ?? 'Unknown user',
                avatar_url: message.author?.generateAvatarURL({ max_side: 128 }),
            },
            {
                headers: {
                    "Authorization": `Bot ${discordClient.token}`
                }
            }
        )
        .then(async res => {
            await BRIDGED_MESSAGES.update({
                revolt: {
                    messageId: message._id
                }
            }, {
                $set: {
                    discord: {
                        messageId: res.data._id
                    }
                }
            });
        })
        .catch(e => {
            console.error('Failed to execute webhook', e.response.data);
        });
    } catch(e) {
        console.error(e);
    }
});
