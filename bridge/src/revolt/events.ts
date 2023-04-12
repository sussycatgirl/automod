import { BRIDGED_EMOJIS, BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { AUTUMN_URL, client } from "./client";
import { client as discordClient } from "../discord/client";
import { Channel as DiscordChannel, Message as DiscordMessage, MessageEmbed, MessagePayload, TextChannel, WebhookClient, WebhookMessageOptions } from "discord.js";
import GenericEmbed from "../types/GenericEmbed";
import { SendableEmbed, SystemMessage } from "revolt-api";
import {
    clipText,
    discordFetchMessage,
    revoltFetchMessage,
    revoltFetchUser,
} from "../util";
import { smartReplace } from "smart-replace";
import { metrics } from "../metrics";
import { fetchEmojiList } from "../discord/bridgeEmojis";

const RE_MENTION_USER = /<@[0-9A-HJ-KM-NP-TV-Z]{26}>/g;
const RE_MENTION_CHANNEL = /<#[0-9A-HJ-KM-NP-TV-Z]{26}>/g;
const RE_EMOJI = /:[^\s]+/g;

const KNOWN_EMOJI_NAMES: string[] = [];

fetchEmojiList()
    .then((emojis) =>
        Object.keys(emojis).forEach((name) => KNOWN_EMOJI_NAMES.push(name))
    )
    .catch((e) => console.error(e));

client.on("messageDelete", async (id) => {
    try {
        logger.debug(`[D] Revolt: ${id}`);

        const bridgedMsg = await BRIDGED_MESSAGES.findOne({
            "revolt.messageId": id,
        });
        if (!bridgedMsg?.discord.messageId)
            return logger.debug(
                `Revolt: Message has not been bridged; ignoring delete`
            );
        if (!bridgedMsg.channels?.discord)
            return logger.debug(
                `Revolt: Channel for deleted message is unknown`
            );

        const bridgeCfg = await BRIDGE_CONFIG.findOne({
            revolt: bridgedMsg.channels.revolt,
        });
        if (!bridgeCfg?.discordWebhook)
            return logger.debug(`Revolt: No Discord webhook stored`);
        if (
            !bridgeCfg.discord ||
            bridgeCfg.discord != bridgedMsg.channels.discord
        ) {
            return logger.debug(
                `Revolt: Discord channel is no longer linked; ignoring delete`
            );
        }

        const targetMsg = await discordFetchMessage(
            bridgedMsg.discord.messageId,
            bridgeCfg.discord
        );
        if (!targetMsg)
            return logger.debug(`Revolt: Could not fetch message from Discord`);

        if (
            targetMsg.webhookId &&
            targetMsg.webhookId == bridgeCfg.discordWebhook.id
        ) {
            const client = new WebhookClient({
                id: bridgeCfg.discordWebhook.id,
                token: bridgeCfg.discordWebhook.token,
            });
            await client.deleteMessage(bridgedMsg.discord.messageId);
            client.destroy();
            metrics.messages.inc({ source: "revolt", type: "delete" });
        } else if (targetMsg.deletable) {
            targetMsg.delete();
            metrics.messages.inc({ source: "revolt", type: "delete" });
        } else logger.debug(`Revolt: Unable to delete Discord message`);
    } catch (e) {
        console.error(e);
    }
});

client.on("messageUpdate", async (message) => {
    if (!message.content || typeof message.content != "string") return;
    if (message.authorId == client.user?.id) return;

    try {
        logger.debug(`[E] Revolt: ${message.content}`);

        if (!message.author) await client.users.fetch(message.authorId!);

        const [bridgeCfg, bridgedMsg] = await Promise.all([
            BRIDGE_CONFIG.findOne({ revolt: message.channelId }),
            BRIDGED_MESSAGES.findOne({ "revolt.nonce": message.nonce }),
        ]);

        if (!bridgedMsg)
            return logger.debug(
                `Revolt: Message has not been bridged; ignoring edit`
            );
        if (!bridgeCfg?.discord)
            return logger.debug(`Revolt: No Discord channel associated`);
        if (!bridgeCfg.discordWebhook)
            return logger.debug(`Revolt: No Discord webhook stored`);

        const targetMsg = await discordFetchMessage(
            bridgedMsg.discord.messageId,
            bridgeCfg.discord
        );
        if (!targetMsg)
            return logger.debug(`Revolt: Could not fetch message from Discord`);

        const webhookClient = new WebhookClient({
            id: bridgeCfg.discordWebhook.id,
            token: bridgeCfg.discordWebhook.token,
        });
        await webhookClient.editMessage(targetMsg, {
            content: await renderMessageBody(message.content),
            allowedMentions: { parse: [] },
        });
        webhookClient.destroy();

        metrics.messages.inc({ source: "revolt", type: "edit" });
    } catch (e) {
        console.error(e);
    }
});

client.on("messageCreate", async (message) => {
    try {
        logger.debug(`[M] Revolt: ${message.id} ${message.content}`);

        if (!message.author) await client.users.fetch(message.authorId!);

        const [bridgeCfg, bridgedMsg, ...repliedMessages] = await Promise.all([
            BRIDGE_CONFIG.findOne({ revolt: message.channelId }),
            BRIDGED_MESSAGES.findOne(
                message.nonce
                    ? { "revolt.nonce": message.nonce }
                    : { "revolt.messageId": message.id }
            ),
            ...(message.replyIds?.map((id) =>
                BRIDGED_MESSAGES.findOne({ "revolt.messageId": id })
            ) ?? []),
        ]);

        if (bridgedMsg)
            return logger.debug(
                `Revolt: Message has already been bridged; ignoring`
            );
        if (message.systemMessage && bridgeCfg?.config?.disable_system_messages)
            return logger.debug(
                `Revolt: System message bridging disabled; ignoring`
            );
        if (bridgeCfg?.config?.read_only_revolt)
            return logger.debug(`Revolt: Channel is marked as read only`);
        if (!bridgeCfg?.discord)
            return logger.debug(`Revolt: No Discord channel associated`);
        if (!bridgeCfg.discordWebhook) {
            logger.debug(
                `Revolt: No Discord webhook stored; Creating new Webhook`
            );

            try {
                const channel = (await discordClient.channels.fetch(
                    bridgeCfg.discord
                )) as TextChannel;
                if (!channel || !channel.isText())
                    throw "Error: Unable to fetch channel";
                const ownPerms = (channel as TextChannel).permissionsFor(
                    discordClient.user!
                );
                if (!ownPerms?.has("MANAGE_WEBHOOKS"))
                    throw "Error: Bot user does not have MANAGE_WEBHOOKS permission";

                const hook = await (channel as TextChannel).createWebhook(
                    "AutoMod Bridge",
                    { avatar: discordClient.user?.avatarURL() }
                );

                bridgeCfg.discordWebhook = {
                    id: hook.id,
                    token: hook.token || "",
                };
                await BRIDGE_CONFIG.update(
                    { revolt: message.channelId },
                    {
                        $set: {
                            discordWebhook: bridgeCfg.discordWebhook,
                        },
                    }
                );
            } catch (e) {
                logger.warn(
                    `Unable to create new webhook for channel ${bridgeCfg.discord}; Deleting link\n${e}`
                );
                await BRIDGE_CONFIG.remove({ revolt: message.channelId });
                await message.channel
                    ?.sendMessage(
                        ":warning: I was unable to create a webhook in the bridged Discord channel. " +
                            `The bridge has been removed; if you wish to rebridge, use the \`/bridge\` command.`
                    )
                    .catch(() => {});

                return;
            }
        }

        await BRIDGED_MESSAGES.update(
            { "revolt.messageId": message.id },
            {
                $set: {
                    revolt: {
                        messageId: message.id,
                        nonce: message.nonce,
                    },
                    channels: {
                        revolt: message.channelId,
                        discord: bridgeCfg.discord,
                    },
                },
                $setOnInsert: {
                    discord: {},
                    origin: "revolt",
                },
            },
            { upsert: true }
        );

        const channel = (await discordClient.channels.fetch(
            bridgeCfg.discord
        )) as TextChannel;
        const webhookClient = new WebhookClient({
            id: bridgeCfg.discordWebhook!.id,
            token: bridgeCfg.discordWebhook!.token,
        });

        const payload: MessagePayload | WebhookMessageOptions = {
            content:
                message.content
                    ? await renderMessageBody(message.content)
                    : message.systemMessage
                    ? await renderSystemMessage(message.systemMessage)
                    : undefined,
            username: message.systemMessage
                ? "Revolt"
                : (bridgeCfg.config?.bridge_nicknames
                      ? message.masquerade?.name ??
                        message.member?.nickname ??
                        message.author?.username
                      : message.author?.username) ?? "Unknown user",
            avatarURL: message.systemMessage
                ? "https://app.revolt.chat/assets/logo_round.png"
                : bridgeCfg.config?.bridge_nicknames
                ? message.masquerade?.avatar ??
                  message.member?.avatarURL ??
                  message.author?.avatarURL
                : message.author?.avatarURL,
            embeds: message.embeds?.length
                ? message.embeds
                      .filter((e) => e.type == "Text")
                      .map((e) =>
                          new GenericEmbed(e as SendableEmbed).toDiscord()
                      )
                : undefined,
            allowedMentions: { parse: [] },
        };

        if (repliedMessages.length) {
            const embed = new MessageEmbed().setColor("#2f3136");

            if (repliedMessages.length == 1) {
                const replyMsg =
                    repliedMessages[0]?.origin == "discord"
                        ? await discordFetchMessage(
                              repliedMessages[0]?.discord.messageId,
                              bridgeCfg.discord
                          )
                        : undefined;
                const author = replyMsg?.author;

                if (replyMsg) {
                    embed.setAuthor({
                        name: `@${author?.username ?? "Unknown"}`, // todo: check if @pinging was enabled for reply
                        iconURL: author?.displayAvatarURL({
                            size: 64,
                            dynamic: true,
                        }),
                        url: replyMsg?.url,
                    });
                    if (replyMsg?.content)
                        embed.setDescription(
                            ">>> " + clipText(replyMsg.content, 200)
                        );
                } else {
                    const msg = await revoltFetchMessage(
                        message.replyIds?.[0],
                        message.channel
                    );
                    const brMsg = repliedMessages.find(
                        (m) => m?.revolt.messageId == msg?.id
                    );
                    embed.setAuthor({
                        name: `@${msg?.author?.username ?? "Unknown"}`,
                        iconURL: msg?.author?.avatarURL,
                        url: brMsg
                            ? `https://discord.com/channels/${
                                  channel.guildId
                              }/${brMsg.channels?.discord || channel.id}/${
                                  brMsg.discord.messageId
                              }`
                            : undefined,
                    });
                    if (msg?.content)
                        embed.setDescription(
                            ">>> " + clipText(msg.content, 200)
                        );
                }
            } else {
                const replyMsgs = await Promise.all(
                    repliedMessages.map((m) =>
                        m?.origin == "discord"
                            ? discordFetchMessage(
                                  m?.discord.messageId,
                                  bridgeCfg.discord
                              )
                            : revoltFetchMessage(
                                  m?.revolt.messageId,
                                  message.channel
                              )
                    )
                );

                embed.setAuthor({ name: repliedMessages.length + " replies" });

                for (const msg of replyMsgs) {
                    let msgUrl = "";
                    if (msg instanceof DiscordMessage) {
                        msgUrl = msg.url;
                    } else {
                        const brMsg = repliedMessages.find(
                            (m) => m?.revolt.messageId == msg?.id
                        );
                        if (brMsg)
                            msgUrl = `https://discord.com/channels/${
                                channel.guildId
                            }/${brMsg.channels?.discord || channel.id}/${
                                brMsg.discord.messageId
                            }`;
                    }

                    embed.addField(
                        `@${msg?.author?.username ?? "Unknown"}`,
                        (msg ? `[Link](${msgUrl})\n` : "") +
                            ">>> " +
                            clipText(msg?.content ?? "\u200b", 100),
                        true
                    );
                }
            }

            if (payload.embeds) payload.embeds.unshift(embed);
            else payload.embeds = [embed];
        }

        if (message.attachments?.length) {
            payload.files = [];

            for (const attachment of message.attachments) {
                payload.files.push({
                    attachment: `${AUTUMN_URL}/attachments/${attachment.id}/${attachment.filename}`,
                    name: attachment.filename,
                });
            }
        }

        webhookClient
            .send(payload)
            .then(async (res) => {
                await BRIDGED_MESSAGES.update(
                    {
                        "revolt.messageId": message.id,
                    },
                    {
                        $set: {
                            "discord.messageId": res.id,
                        },
                    }
                );

                metrics.messages.inc({ source: "revolt", type: "create" });
            })
            .catch(async (e) => {
                console.error(
                    "Failed to execute webhook:",
                    e?.response?.data ?? e
                );
                if (`${e}` == "DiscordAPIError: Unknown Webhook") {
                    try {
                        logger.warn(
                            "Revolt: Got Unknown Webhook error, deleting webhook config"
                        );
                        await BRIDGE_CONFIG.update(
                            { revolt: message.channelId },
                            { $set: { discordWebhook: undefined } }
                        );
                    } catch (e) {
                        console.error(e);
                    }
                }
            });
    } catch (e) {
        console.error(e);
    }
});

// Replaces @mentions, #channel mentions, :emojis: and makes markdown features work on Discord
async function renderMessageBody(message: string): Promise<string> {
    // @mentions
    message = await smartReplace(
        message,
        RE_MENTION_USER,
        async (match) => {
            const id = match.replace("<@", "").replace(">", "");
            const user = await revoltFetchUser(id);
            return `@${user?.username || id}`;
        },
        { cacheMatchResults: true, maxMatches: 10 }
    );

    // #channels
    message = await smartReplace(
        message,
        RE_MENTION_CHANNEL,
        async (match) => {
            const id = match.replace("<#", "").replace(">", "");
            const channel = client.channels.get(id);

            const bridgeCfg = channel
                ? await BRIDGE_CONFIG.findOne({ revolt: channel.id })
                : undefined;
            const discordChannel = bridgeCfg?.discord
                ? discordClient.channels.cache.get(bridgeCfg.discord)
                : undefined;

            return discordChannel
                ? `<#${discordChannel.id}>`
                : `#${channel?.name || id}`;
        },
        { cacheMatchResults: true, maxMatches: 10 }
    );

    message = await smartReplace(
        message,
        RE_EMOJI,
        async (match) => {
            const emojiName = match.replace(/(^:)|(:$)/g, "");

            if (!KNOWN_EMOJI_NAMES.includes(emojiName)) return match;

            const dbEmoji = await BRIDGED_EMOJIS.findOne({ name: emojiName });
            if (!dbEmoji) return match;

            return `<${dbEmoji.animated ? "a" : ""}:${emojiName}:${
                dbEmoji.emojiid
            }>`;
        },
        { cacheMatchResults: true, maxMatches: 40 }
    );

    message = message
        // Escape ||Discord style spoilers|| since Revite doesn't support them
        .replace(/\|\|.+\|\|/gs, (match) => "\\" + match)
        // Translate !!Revite spoilers!! to ||Discord spoilers||
        .replace(
            /!!.+!!/g,
            (match) => `||${match.substring(2, match.length - 2)}||`
        )
        // KaTeX blocks
        .replace(/(\$\$[^$]+\$\$)|(\$[^$]+\$)/g, (match) => {
            const dollarCount =
                match.startsWith("$$") && match.endsWith("$$") ? 2 : 1;
            const tex = match.substring(
                dollarCount,
                match.length - dollarCount
            );
            const output = `[\`${tex}\`](<https://automod.me/tex/?tex=${encodeURI(
                tex
            )}>)`;

            // Make sure we don't blow through the message length limit
            const newLength = message.length - match.length + output.length;
            return newLength <= 2000 ? output : `\`${tex}\``;
        });

    return message;
}

async function renderSystemMessage(message: SystemMessage): Promise<string> {
    const getUsername = async (id: string) =>
        `**@${(await revoltFetchUser(id))?.username.replace(/\*/g, "\\*")}**`;

    switch (message.type) {
        case "user_joined":
        case "user_added":
            return `<:joined:1042831832888127509> ${await getUsername(
                message.id
            )} joined`;
        case "user_left":
        case "user_remove":
            return `<:left:1042831834259652628> ${await getUsername(
                message.id
            )} left`;
        case "user_kicked":
            return `<:kicked:1042831835421483050> ${await getUsername(
                message.id
            )} was kicked`;
        case "user_banned":
            return `<:banned:1042831836675588146> ${await getUsername(
                message.id
            )} was banned`;
        case "channel_renamed":
            return `<:channel_renamed:1042831837912891392> ${await getUsername(
                message.by
            )} renamed the channel to **${message.name}**`;
        case "channel_icon_changed":
            return `<:channel_icon:1042831840538542222> ${await getUsername(
                message.by
            )} changed the channel icon`;
        case "channel_description_changed":
            return `<:channel_description:1042831839217328228> ${await getUsername(
                message.by
            )} changed the channel description`;
        case "text":
            return message.content;
        default:
            return Object.entries(message)
                .map((e) => `${e[0]}: ${e[1]}`)
                .join(", ");
    }
}
