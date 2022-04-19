import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { client } from "./client";
import { AUTUMN_URL, client as revoltClient } from "../revolt/client";
import { ChannelPermission } from "@janderedev/revolt.js";
import axios from 'axios';
import { ulid } from "ulid";
import GenericEmbed from "../types/GenericEmbed";
import FormData from 'form-data';
import { discordFetchUser, revoltFetchMessage } from "../util";
import { TextChannel } from "discord.js";

const MAX_BRIDGED_FILE_SIZE = 8_000_000; // 8 MB
const RE_MENTION_USER = /<@!*[0-9]+>/g;
const RE_MENTION_CHANNEL = /<#[0-9]+>/g;

client.on('messageDelete', async message => {
    try {
        logger.debug(`[D] Discord: ${message.id}`);

        const [ bridgeCfg, bridgedMsg ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ discord: message.channelId }),
            BRIDGED_MESSAGES.findOne({ "discord.messageId": message.id }),
        ]);

        if (!bridgedMsg?.revolt) return logger.debug(`Discord: Message has not been bridged; ignoring deletion`);
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);

        const targetMsg = await revoltFetchMessage(bridgedMsg.revolt.messageId, revoltClient.channels.get(bridgeCfg.revolt));
        if (!targetMsg) return logger.debug(`Discord: Could not fetch message from Revolt`);

        await targetMsg.delete();
    } catch(e) {
        console.error(e);
    }
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (oldMsg.content && newMsg.content == oldMsg.content) return; // Let's not worry about embeds here for now

    try {
        logger.debug(`[E] Discord: ${newMsg.content}`);

        const [ bridgeCfg, bridgedMsg ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ discord: newMsg.channel.id }),
            BRIDGED_MESSAGES.findOne({ "discord.messageId": newMsg.id }),
        ]);

        if (!bridgedMsg) return logger.debug(`Discord: Message has not been bridged; ignoring edit`);
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);
        if (newMsg.webhookId && newMsg.webhookId == bridgeCfg.discordWebhook?.id) {
            return logger.debug(`Discord: Message was sent by bridge; ignoring edit`);
        }

        const targetMsg = await revoltFetchMessage(bridgedMsg.revolt.messageId, revoltClient.channels.get(bridgeCfg.revolt));
        if (!targetMsg) return logger.debug(`Discord: Could not fetch message from Revolt`);

        await targetMsg.edit({ content: newMsg.content ? await renderMessageBody(newMsg.content) : undefined });
    } catch(e) {
        console.error(e);
    }
});

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
                    channels: {
                        discord: message.channelId,
                        revolt: bridgeCfg.revolt,
                    }
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
                content: message.content ? await renderMessageBody(message.content) : undefined,
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

// Replaces @mentions and #channel mentions
async function renderMessageBody(message: string): Promise<string> {
    // We don't want users to generate large amounts of database and API queries
    let failsafe = 0;

    // @mentions
    while (failsafe < 10) {
        failsafe++;

        const text = message.match(RE_MENTION_USER)?.[0];
        if (!text) break;

        const id = text.replace('<@!', '').replace('<@', '').replace('>', '');
        const user = await discordFetchUser(id);

        // replaceAll() when
        while (message.includes(text)) message = message.replace(text, `@${user?.username || id}`);
    }

    // #channels
    while (failsafe < 10) {
        failsafe++;

        const text = message.match(RE_MENTION_CHANNEL)?.[0];
        if (!text) break;

        const id = text.replace('<#', '').replace('>', '');
        const channel = client.channels.cache.get(id);
        const bridgeCfg = channel ? await BRIDGE_CONFIG.findOne({ discord: channel.id }) : undefined;
        const revoltChannel = bridgeCfg?.revolt
            ? revoltClient.channels.get(bridgeCfg.revolt)
            : undefined;

        while (message.includes(text)) {
            message = message.replace(text, revoltChannel ? `<#${revoltChannel._id}>` : `#${(channel as TextChannel)?.name || id}`);
        }
    }

    return message;
}
