import { BRIDGED_EMOJIS, BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { AUTUMN_URL, client } from "./client";
import { client as discordClient } from "../discord/client";
import { Channel as DiscordChannel, Message as DiscordMessage, MessageEmbed, MessagePayload, TextChannel, WebhookClient, WebhookMessageOptions } from "discord.js";
import GenericEmbed from "../types/GenericEmbed";
import { SendableEmbed } from "revolt-api";
import { clipText, discordFetchMessage, revoltFetchMessage, revoltFetchUser } from "../util";
import { smartReplace } from "smart-replace";
import { metrics } from "../metrics";
import { fetchEmojiList } from "../discord/bridgeEmojis";

const RE_MENTION_USER = /<@[0-9A-HJ-KM-NP-TV-Z]{26}>/g;
const RE_MENTION_CHANNEL = /<#[0-9A-HJ-KM-NP-TV-Z]{26}>/g;
const RE_EMOJI = /:[^\s]+/g;

const KNOWN_EMOJI_NAMES: string[] = [];

fetchEmojiList()
    .then(emojis => Object.keys(emojis).forEach(name => KNOWN_EMOJI_NAMES.push(name)))
    .catch(e => console.error(e));

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
            metrics.messages.inc({ source: 'revolt', type: 'delete' });
        } else if (targetMsg.deletable) {
            targetMsg.delete();
            metrics.messages.inc({ source: 'revolt', type: 'delete' });
        } else logger.debug(`Revolt: Unable to delete Discord message`);
    } catch(e) {
        console.error(e);
    }
});

client.on('message/update', async message => {
    if (!message.content || typeof message.content != 'string') return;
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
        await client.editMessage(targetMsg, { content: await renderMessageBody(message.content), allowedMentions: { parse: [ ] } });
        client.destroy();

        metrics.messages.inc({ source: 'revolt', type: 'edit' });
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
            logger.debug(`Revolt: No Discord webhook stored; Creating new Webhook`);

            try {
                const channel = await discordClient.channels.fetch(bridgeCfg.discord) as TextChannel;
                if (!channel || !channel.isText()) throw 'Error: Unable to fetch channel';
                const ownPerms = (channel as TextChannel).permissionsFor(discordClient.user!);
                if (!ownPerms?.has('MANAGE_WEBHOOKS')) throw 'Error: Bot user does not have MANAGE_WEBHOOKS permission';

                const hook = await (channel as TextChannel).createWebhook('AutoMod Bridge', { avatar: discordClient.user?.avatarURL() });

                bridgeCfg.discordWebhook = {
                    id: hook.id,
                    token: hook.token || '',
                };
                await BRIDGE_CONFIG.update(
                    { revolt: message.channel_id },
                    {
                        $set: {
                            discordWebhook: bridgeCfg.discordWebhook,
                        }
                    }
                );
            } catch(e) {
                logger.warn(`Unable to create new webhook for channel ${bridgeCfg.discord}; Deleting link\n${e}`);
                await BRIDGE_CONFIG.remove({ revolt: message.channel_id });
                await message.channel?.sendMessage(':warning: I was unable to create a webhook in the bridged Discord channel. '
                    + `The bridge has been removed; if you wish to rebridge, use the \`/bridge\` command.`).catch(() => {});

                return;
            }
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

        const channel = await discordClient.channels.fetch(bridgeCfg.discord) as TextChannel;
        const client = new WebhookClient({
            id: bridgeCfg.discordWebhook!.id,
            token: bridgeCfg.discordWebhook!.token,
        });

        const payload: MessagePayload|WebhookMessageOptions = {
            content: message.content ? await renderMessageBody(message.content) : undefined,
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
                const replyMsg = repliedMessages[0]?.origin == 'discord'
                    ? await discordFetchMessage(repliedMessages[0]?.discord.messageId, bridgeCfg.discord)
                    : undefined;
                const author = replyMsg?.author;

                if (replyMsg) {
                    embed.setAuthor({
                        name: `@${author?.username ?? 'Unknown'}`, // todo: check if @pinging was enabled for reply
                        iconURL: author?.displayAvatarURL({ size: 64, dynamic: true }),
                        url: replyMsg?.url,
                    });
                    if (replyMsg?.content) embed.setDescription('>>> ' + clipText(replyMsg.content, 200));
                } else {
                    const msg = await revoltFetchMessage(message.reply_ids?.[0], message.channel);
                    const brMsg = repliedMessages.find(m => m?.revolt.messageId == msg?._id);
                    embed.setAuthor({
                        name: `@${msg?.author?.username ?? 'Unknown'}`,
                        iconURL: msg?.author?.generateAvatarURL({ size: 64 }),
                        url: brMsg ? `https://discord.com/channels/${channel.guildId}/${brMsg.channels?.discord || channel.id}/${brMsg.discord.messageId}` : undefined,
                    });
                    if (msg?.content) embed.setDescription('>>> ' + clipText(msg.content, 200));
                }
            } else {
                const replyMsgs = await Promise.all(
                    repliedMessages.map(m => m?.origin == 'discord'
                        ? discordFetchMessage(m?.discord.messageId, bridgeCfg.discord)
                        : revoltFetchMessage(m?.revolt.messageId, message.channel))
                );

                embed.setAuthor({ name: repliedMessages.length + ' replies' });

                for (const msg of replyMsgs) {
                    let msgUrl = '';
                    if (msg instanceof DiscordMessage) {
                        msgUrl = msg.url;
                    } else {
                        const brMsg = repliedMessages.find(m => m?.revolt.messageId == msg?._id);
                        if (brMsg) msgUrl = `https://discord.com/channels/${channel.guildId}/${brMsg.channels?.discord || channel.id}/${brMsg.discord.messageId}`;
                    }

                    embed.addField(
                        `@${msg?.author?.username ?? 'Unknown'}`,
                        (msg ? `[Link](${msgUrl})\n` : '') +
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

            metrics.messages.inc({ source: 'revolt', type: 'create' });
        })
        .catch(async e => {
            console.error('Failed to execute webhook:', e?.response?.data ?? e);
            if (`${e}` == 'DiscordAPIError: Unknown Webhook') {
                try {
                    logger.warn('Revolt: Got Unknown Webhook error, deleting webhook config');
                    await BRIDGE_CONFIG.update({ revolt: message.channel_id }, { $set: { discordWebhook: undefined } });
                } catch(e) {
                    console.error(e);
                }
            }
        });
    } catch(e) {
        console.error(e);
    }
});

// Replaces @mentions, #channel mentions and :emojis:
async function renderMessageBody(message: string): Promise<string> {
    // We don't want users to generate large amounts of database and API queries
    let failsafe = 0;

    // @mentions
    message = await smartReplace(message, RE_MENTION_USER, async (match) => {
        const id = match.replace('<@', '').replace('>', '');
        const user = await revoltFetchUser(id);
        return `@${user?.username || id}`;
    }, { cacheMatchResults: true, maxMatches: 10 });

    // #channels
    message = await smartReplace(message, RE_MENTION_CHANNEL, async (match) => {
        const id = match.replace('<#', '').replace('>', '');
        const channel = client.channels.get(id);

        const bridgeCfg = channel ? await BRIDGE_CONFIG.findOne({ revolt: channel._id }) : undefined;
        const discordChannel = bridgeCfg?.discord
            ? discordClient.channels.cache.get(bridgeCfg.discord)
            : undefined;

        return discordChannel ? `<#${discordChannel.id}>` : `#${channel?.name || id}`;
    }, { cacheMatchResults: true, maxMatches: 10 });

    message = await smartReplace(message, RE_EMOJI, async (match) => {
        const emojiName = match.replace(/(^:)|(:$)/g, '');

        if (!KNOWN_EMOJI_NAMES.includes(emojiName)) return match;

        const dbEmoji = await BRIDGED_EMOJIS.findOne({ name: emojiName });
        if (!dbEmoji) return match;

        return `<${dbEmoji.animated ? 'a' : ''}:${emojiName}:${dbEmoji.emojiid}>`;
    }, { cacheMatchResults: true, maxMatches: 40 });

    return message;
}
