import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { client } from "./client";
import { AUTUMN_URL, client as revoltClient } from "../revolt/client";
import { ChannelPermission } from "@janderedev/revolt.js";
import axios from 'axios';
import { ulid } from "ulid";
import GenericEmbed from "../types/GenericEmbed";
import FormData from 'form-data';

const MAX_BRIDGED_FILE_SIZE = 1_048_576; // 1 MiB

client.on('messageCreate', async message => {
    try {
        logger.debug(`[M] Discord: ${message.content}`);
        const [ bridgeCfg, bridgedReply ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ discord: message.channelId }),
            (message.reference?.messageId
                ? BRIDGED_MESSAGES.findOne({ "discord.messageId": message.reference.messageId })
                : undefined
            ),
        ]);

        if (message.webhookId && bridgeCfg?.discordWebhook?.id == message.webhookId) {
            return logger.debug(`Discord: Message has already been bridged; ignoring`);
        }
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);

        const channel = revoltClient.channels.get(bridgeCfg.revolt);
        if (!channel) return logger.debug(`Discord: Cannot find associated channel`);

        if (!(channel.permission & ChannelPermission.SendMessage)) {
            return logger.debug(`Discord: Lacking SendMessage permission; refusing to send`);
        }

        if (!(channel.permission & ChannelPermission.Masquerade)) {
            return logger.debug(`Discord: Lacking Masquerade permission; refusing to send`);
        }

        // Setting a known nonce allows us to ignore bridged
        // messages while still letting other AutoMod messages pass.
        const nonce = ulid();

        await BRIDGED_MESSAGES.update(
            { "discord.messageId": message.id },
            {
                $setOnInsert: {
                    origin: 'discord',
                    discord: {
                        messageId: message.id,
                    },
                },
                $set: {
                    'revolt.nonce': nonce,
                }
            },
            { upsert: true }
        );

        const autumnUrls: string[] = [];

        // todo: upload all attachments at once instead of sequentially
        for (const a of message.attachments) {
            try {
                if (a[1].size > MAX_BRIDGED_FILE_SIZE) {
                    logger.debug(`Skipping attachment ${a[0]} ${a[1].name}: Size ${a[1].size} > max (${MAX_BRIDGED_FILE_SIZE})`);
                    continue;
                }

                logger.debug(`Downloading attachment ${a[0]} ${a[1].name} (Size ${a[1].size})`);

                const formData = new FormData();
                const file = await axios.get(a[1].url, { responseType: 'arraybuffer' });

                logger.debug(`Downloading attachment ${a[0]} finished, uploading to autumn`);

                formData.append(
                    a[0],
                    file.data,
                    {
                        filename: a[1].name || a[0],
                        contentType: a[1].contentType || undefined
                    }
                );

                const res = await axios.post(
                    `${AUTUMN_URL}/attachments`, formData, { headers: formData.getHeaders() }
                );

                logger.debug(`Uploading attachment ${a[0]} finished`);

                autumnUrls.push(res.data.id);
            } catch(e) { console.error(e) }
        }

        const sendBridgeMessage = async (reply?: string) => {
            const payload = {
                content: message.content,
                //attachments: [],
                //embeds: [],
                nonce: nonce,
                replies: reply ? [ { id: reply, mention: !!message.mentions.repliedUser } ] : undefined,
                masquerade: {
                    name: message.author.username,
                    avatar: message.author.displayAvatarURL({ size: 128 }),
                },
                embeds: message.embeds.length
                    ? message.embeds.map(e => new GenericEmbed(e).toRevolt())
                    : undefined,
                attachments: autumnUrls.length ? autumnUrls : undefined,
            };

            await axios.post(
                `${revoltClient.apiURL}/channels/${channel._id}/messages`,
                payload,
                {
                    headers: {
                        'x-bot-token': process.env['REVOLT_TOKEN']!
                    }
                }
            )
            .then(async res => {
                await BRIDGED_MESSAGES.update(
                    { "discord.messageId": message.id },
                    {
                        $set: { "revolt.messageId": res.data._id },
                    }
                );
            })
            .catch(async e => {
                console.error(`Failed to send message`, e.response.data);
                if (reply) {
                    console.info('Reytring without reply');
                    await sendBridgeMessage(undefined);
                }
            });
        }

        await sendBridgeMessage(bridgedReply?.revolt?.messageId);
    } catch(e) {
        console.error(e);
    }
});
