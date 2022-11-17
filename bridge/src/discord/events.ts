import { BRIDGED_MESSAGES, BRIDGE_CONFIG, BRIDGE_USER_CONFIG, logger } from "..";
import { client } from "./client";
import { AUTUMN_URL, client as revoltClient } from "../revolt/client";
import axios from 'axios';
import { ulid } from "ulid";
import GenericEmbed from "../types/GenericEmbed";
import FormData from 'form-data';
import { discordFetchUser, revoltFetchMessage } from "../util";
import { MessageEmbed, TextChannel } from "discord.js";
import { smartReplace } from "smart-replace";
import { metrics } from "../metrics";
import { SendableEmbed } from "revolt-api";

const MAX_BRIDGED_FILE_SIZE = 8_000_000; // 8 MB
const RE_MENTION_USER = /<@!*[0-9]+>/g;
const RE_MENTION_CHANNEL = /<#[0-9]+>/g;
const RE_EMOJI = /<(a?)?:\w+:\d{18}?>/g;
const RE_TENOR = /^https:\/\/tenor.com\/view\/[^\s]+$/g;
const RE_TENOR_META = /<meta class="dynamic" property="og:url" content="[^\s]+">/g

client.on('messageDelete', async message => {
    try {
        logger.debug(`[D] Discord: ${message.id}`);

        const [ bridgeCfg, bridgedMsg ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ discord: message.channelId }),
            BRIDGED_MESSAGES.findOne({ "discord.messageId": message.id }),
        ]);

        if (!bridgedMsg?.revolt) return logger.debug(`Discord: Message has not been bridged; ignoring deletion`);
        if (bridgedMsg.ignore) return logger.debug(`Discord: Message marked as ignore`);
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);

        const targetMsg = await revoltFetchMessage(bridgedMsg.revolt.messageId, revoltClient.channels.get(bridgeCfg.revolt));
        if (!targetMsg) return logger.debug(`Discord: Could not fetch message from Revolt`);

        await targetMsg.delete();
        metrics.messages.inc({ source: 'discord', type: 'delete' });
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
        if (bridgedMsg.ignore) return logger.debug(`Discord: Message marked as ignore`);
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);
        if (newMsg.webhookId && newMsg.webhookId == bridgeCfg.discordWebhook?.id) {
            return logger.debug(`Discord: Message was sent by bridge; ignoring edit`);
        }

        const targetMsg = await revoltFetchMessage(bridgedMsg.revolt.messageId, revoltClient.channels.get(bridgeCfg.revolt));
        if (!targetMsg) return logger.debug(`Discord: Could not fetch message from Revolt`);

        await targetMsg.edit({ content: newMsg.content ? await renderMessageBody(newMsg.content) : undefined });
        metrics.messages.inc({ source: 'discord', type: 'edit' });
    } catch(e) {
        console.error(e);
    }
});

client.on('messageCreate', async message => {
    try {
        logger.debug(`[M] Discord: ${message.content}`);
        const [ bridgeCfg, bridgedReply, userConfig ] = await Promise.all([
            BRIDGE_CONFIG.findOne({ discord: message.channelId }),
            (message.reference?.messageId
                ? BRIDGED_MESSAGES.findOne({ "discord.messageId": message.reference.messageId })
                : undefined
            ),
            BRIDGE_USER_CONFIG.findOne({ id: message.author.id }),
        ]);

        if (message.webhookId && bridgeCfg?.discordWebhook?.id == message.webhookId) {
            return logger.debug(`Discord: Message has already been bridged; ignoring`);
        }
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);

        const channel = revoltClient.channels.get(bridgeCfg.revolt);
        if (!channel) return logger.debug(`Discord: Cannot find associated channel`);

        if (!(channel.havePermission('SendMessage'))) {
            return logger.debug(`Discord: Lacking SendMessage permission; refusing to send`);
        }

        for (const perm of [ 'SendEmbeds', 'UploadFiles', 'Masquerade' ]) {
            if (!(channel.havePermission(perm as any))) {
                // todo: maybe don't spam this on every message?
                await channel.sendMessage(`Missing permission: I don't have the \`${perm}\` permission `
                    + `which is required to bridge a message sent by \`${message.author.tag}\` on Discord.`);
                return logger.debug(`Discord: Lacking ${perm} permission; refusing to send`);
            }
        }

        if (
            bridgeCfg.config?.disallow_opt_out &&
            userConfig?.optOut &&
            message.deletable
        ) {
            await message.delete();
            return;
        }

        // Setting a known nonce allows us to ignore bridged
        // messages while still letting other AutoMod messages pass.
        const nonce = ulid();

        await BRIDGED_MESSAGES.update(
            { "discord.messageId": message.id },
            {
                $setOnInsert: userConfig?.optOut ? {} : {
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
                    },
                    ignore: userConfig?.optOut,
                }
            },
            { upsert: true }
        );

        if (userConfig?.optOut) {
            const msg = await channel.sendMessage({
                content: `$\\color{#565656}\\small{\\textsf{Message content redacted}}$`,
                masquerade: {
                    name: 'AutoMod Bridge',
                },
                nonce: nonce,
            });

            await BRIDGED_MESSAGES.update(
                { "discord.messageId": message.id },
                {
                    $set: { "revolt.messageId": msg._id },
                }
            );

            return;
        }

        const autumnUrls: string[] = [];
        const stickerEmbeds: SendableEmbed[] = [];

        if (message.stickers.size) {
            for (const sticker of message.stickers) {
                try {
                    logger.debug(`Downloading sticker ${sticker[0]} ${sticker[1].name}`);

                    const formData = new FormData();
                    const file = await axios.get(sticker[1].url, { responseType: 'arraybuffer' });

                    logger.debug(`Downloading sticker ${sticker[0]} finished, uploading to autumn`);

                    formData.append(
                        sticker[0],
                        file.data,
                        {
                            filename: sticker[1].name || sticker[0],
                            contentType: file.headers['content-type']
                                // I have no clue what "LOTTIE" is so I'll pretend it doesn't exist
                                ?? sticker[1].format == "PNG" ? 'image/png' : "image/vnd.mozilla.apng"
                        }
                    );

                    const res = await axios.post(
                        `${AUTUMN_URL}/attachments`, formData, { headers: formData.getHeaders() }
                    );

                    logger.debug(`Uploading attachment ${sticker[0]} finished`);

                    stickerEmbeds.push({
                        colour: 'var(--primary-header)',
                        title: sticker[1].name,
                        media: res.data.id,
                    });
                } catch (e) { console.error(e) }
            }
        }

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
                content: await renderMessageBody(message.content),
                //attachments: [],
                //embeds: [],
                nonce: nonce,
                replies: reply
                    ? [{ id: reply, mention: !!message.mentions.repliedUser }]
                    : undefined,
                masquerade: {
                    name: bridgeCfg.config?.bridge_nicknames
                        ? message.member?.nickname ?? message.author.username
                        : message.author.username,
                    avatar: bridgeCfg.config?.bridge_nicknames
                        ? message.member?.displayAvatarURL({ size: 128 })
                        : message.author.displayAvatarURL({ size: 128 }),
                    colour: channel.server?.havePermission("ManageRole")
                        ? message.member?.displayColor // Discord.js returns black or 0 instead of undefined when no role color is set
                            ? message.member?.displayHexColor
                            : "var(--foreground)"
                        : undefined,
                },
                embeds: [
                    ...stickerEmbeds,
                    ...(message.embeds.length
                        ? message.embeds.map((e) => new GenericEmbed(e).toRevolt())
                        : []),
                ],
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

                metrics.messages.inc({ source: 'discord', type: 'create' });
            })
            .catch(async e => {
                console.error(`Failed to send message: ${e}`);
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

client.on("guildCreate", async (server) => {
    try {
        const me =
            server.me ||
            (await server.members.fetch({ user: client.user!.id }));
        const channels = Array.from(
            server.channels.cache.filter(
                (c) => c.permissionsFor(me).has("SEND_MESSAGES") && c.isText()
            )
        );

        if (!channels.length) return;

        const channel = (channels.find(
            (c) => c[0] == server.systemChannel?.id
        ) || channels[0])?.[1] as TextChannel;

        const message =
            ":wave: Hi there!\n\n" +
            "Thanks for adding AutoMod to this server! Please note that despite its name, this bot only provides " +
            "bridge integration with the AutoMod bot on Revolt (<https://revolt.chat>) and does not offer any moderation " +
            "features on Discord. To get started, run the `/bridge help` command!\n\n" +
            "Before using AutoMod, please make sure you have read the privacy policy: <https://github.com/janderedev/automod/wiki/Privacy-Policy>\n\n" +
            "A note to this server's administrators: When using the bridge, please make sure to also provide your members " +
            "with a link to AutoMod's privacy policy in an accessible place like your rules channel.";

        if (channel.permissionsFor(me).has("EMBED_LINKS")) {
            await channel.send({
                embeds: [
                    new MessageEmbed()
                        .setDescription(message)
                        .setColor("#ff6e6d"),
                ],
            });
        } else {
            await channel.send(message);
        }
    } catch (e) {
        console.error(e);
    }
});

// Replaces @mentions and #channel mentions and modifies body to make markdown render on Revolt
async function renderMessageBody(message: string): Promise<string> {
    // Replace Tenor URLs so they render properly.
    // We have to download the page first, then extract
    // the `c.tenor.com` URL from the meta tags.
    // Could query autumn but that's too much effort and I already wrote this.
    if (RE_TENOR.test(message)) {
        try {
            logger.debug("Replacing tenor URL");

            const res = await axios.get(message, {
                headers: {
                    "User-Agent":
                        "AutoMod/1.0; https://github.com/janderedev/automod",
                },
            });

            const metaTag = RE_TENOR_META.exec(res.data as string)?.[0];
            if (metaTag) {
                return metaTag
                    .replace(
                        '<meta class="dynamic" property="og:url" content="',
                        ""
                    )
                    .replace('">', "");
            }
        } catch (e) {
            logger.warn(`Replacing tenor URL failed: ${e}`);
        }
    }

    // @mentions
    message = await smartReplace(
        message,
        RE_MENTION_USER,
        async (match: string) => {
            const id = match
                .replace("<@!", "")
                .replace("<@", "")
                .replace(">", "");
            const user = await discordFetchUser(id);
            return `@${user?.username || id}`;
        },
        { cacheMatchResults: true, maxMatches: 10 }
    );

    // #channels
    message = await smartReplace(
        message,
        RE_MENTION_CHANNEL,
        async (match: string) => {
            const id = match.replace("<#", "").replace(">", "");
            const channel = client.channels.cache.get(id);
            const bridgeCfg = channel
                ? await BRIDGE_CONFIG.findOne({ discord: channel.id })
                : undefined;
            const revoltChannel = bridgeCfg?.revolt
                ? revoltClient.channels.get(bridgeCfg.revolt)
                : undefined;

            return revoltChannel
                ? `<#${revoltChannel._id}>`
                : `#${(channel as TextChannel)?.name || id}`;
        },
        { cacheMatchResults: true, maxMatches: 10 }
    );

    // :emojis:
    message = await smartReplace(
        message,
        RE_EMOJI,
        async (match: string) => {
            return match
                .replace(/<(a?)?:/, ":\u200b") // We don't want to accidentally send an unrelated emoji, so we add a zero width space here
                .replace(/(:\d{18}?>)/, ":");
        },
        { cacheMatchResults: true }
    );

    message = message
        // "Escape" !!Revite style spoilers!!
        .replace(
            /!!.+!!/g,
            (match) => `!\u200b!${match.substring(2, match.length - 2)}!!`
        )
        // Translate ||Discord spoilers|| to !!Revite spoilers!!, while making sure multiline spoilers continue working
        .replace(/\|\|.+\|\|/gs, (match) => {
            return match
                .substring(2, match.length - 2)
                .split("\n")
                .map((line) => `!!${line.replace(/!!/g, "!\u200b!")}!!`)
                .join("\n");
        });

    return message;
}
