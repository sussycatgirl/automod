import { ServerMember } from "revolt.js";
import { User } from "revolt.js";
import { client, dbs } from "..";
import Infraction from "automod/dist/types/antispam/Infraction";
import FormData from 'form-data';
import axios from 'axios';
import { Server } from "revolt.js";
import LogConfig from "automod/dist/types/LogConfig";
import LogMessage from "automod/dist/types/LogMessage";
import { ColorResolvable, MessageEmbed } from "discord.js";
import logger from "./logger";
import { ulid } from "ulid";
import { Channel } from "revolt.js";
import { Message } from "revolt.js";
import { isSudo } from "./commands/admin/botadm";
import { SendableEmbed } from "revolt-api";
import ServerConfig from "automod/dist/types/ServerConfig";

const NO_MANAGER_MSG = "🔒 Missing permission";
const ULID_REGEX = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/i;
const USER_MENTION_REGEX = /^<@[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const CHANNEL_MENTION_REGEX = /^<#[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const RE_HTTP_URI = /^http(s?):\/\//g;
const RE_MAILTO_URI = /^mailto:/g;

/**
 * Parses user input and returns an user object.
 * Supports: `userID`, `<@userID>` (mention), `username`, `@username` (if user is cached).
 * @param text
 * @returns null if not found, otherwise user object
 */
async function parseUser(text: string): Promise<User | null> {
    if (!text) return null;

    let uid: string | null = null;
    if (USER_MENTION_REGEX.test(text)) {
        uid = text.replace(/<@|>/g, "").toUpperCase();
    } else if (/^[0-9A-HJ-KM-NP-TV-Z]{26}$/gi.test(text)) {
        uid = text.toUpperCase();
    } else {
        if (text.startsWith("@")) text = text.substr(1);

        // Why is there no .find() or .filter()
        let user: User | null = null;
        client.users.forEach((u) => {
            if (u.username?.toLowerCase() == text.toLowerCase()) {
                user = u;
            }
        });

        if (user) return user;
    }

    try {
        if (uid) return (await client.users.fetch(uid)) || null;
        else return null;
    } catch (e) {
        return null;
    }
}

/**
 * Does the exact same as `parseUser`, but returns only `_id` instead
 * of null if the user was not found and the input is also an ID
 */
async function parseUserOrId(
    text: string
): Promise<User | { id: string } | null> {
    let parsed = await parseUser(text);
    if (parsed) return parsed;
    if (ULID_REGEX.test(text)) return { id: text.toUpperCase() };
    return null;
}

async function isModerator(message: Message, announceSudo?: boolean) {
    let member = message.member!,
        server = message.channel!.server!;

    if (member.hasPermission(member.server!, "KickMembers")) return true;

    const [isManager, mods, isSudo] = await Promise.all([
        isBotManager(message),
        dbs.SERVERS.findOne({ id: server.id }),
        checkSudoPermission(message, announceSudo),
    ]);

    return (
        isManager ||
        (mods?.moderators?.indexOf(member.user?.id!) ?? -1) > -1 ||
        isSudo
    );
}
async function isBotManager(message: Message, announceSudo?: boolean) {
    let member = message.member!,
        server = message.channel!.server!;

    if (member.hasPermission(member.server!, "ManageServer")) return true;

    const [managers, isSudo] = await Promise.all([
        dbs.SERVERS.findOne({ id: server.id }),
        checkSudoPermission(message, announceSudo),
    ]);

    return (
        (managers?.botManagers?.indexOf(member.user?.id!) ?? -1) > -1 || isSudo
    );
}
async function checkSudoPermission(
    message: Message,
    announce?: boolean
): Promise<boolean> {
    const hasPerm = isSudo(message.author!);
    if (!hasPerm) return false;
    else {
        if (announce !== false) {
            await message.reply(
                `# :unlock: Bypassed permission check\n` +
                    `Sudo mode is enabled for @${message.author!.username}.\n`
            );
        }
        return true;
    }
}
async function getPermissionLevel(
    member: ServerMember | User,
    server: Server
): Promise<0 | 1 | 2 | 3> {

    if (member instanceof User) {
        member = client.serverMembers.getByKey({ server: server.id, user: member.id }) || await server.fetchMember(member.id);
    }

    if (isSudo(member.user!)) return 3;

    if (member.hasPermission(member.server!, "ManageServer")) return 3;

    const config = await dbs.SERVERS.findOne({ id: server.id });

    if (config?.botManagers?.includes(member.id.user)) return 2;
    if (
        config?.moderators?.includes(member.id.user) ||
        member.hasPermission(member.server!, "KickMembers")
    )
        return 1;

    return 0;
}

function getPermissionBasedOnRole(member: ServerMember): 0 | 1 | 2 | 3 {
    if (member.hasPermission(member.server!, "ManageServer")) return 3;
    if (member.hasPermission(member.server!, "KickMembers")) return 1;
    return 0;
}

async function getOwnMemberInServer(server: Server): Promise<ServerMember> {
    return server.member || await server.fetchMember(client.user!.id);
}

async function storeInfraction(
    infraction: Infraction
): Promise<{ userWarnCount: number }> {
    let r = await Promise.all([
        dbs.INFRACTIONS.insert(infraction, { castIds: false }),
        dbs.INFRACTIONS.find({
            server: infraction.server,
            user: infraction.user,
            _id: { $not: { $eq: infraction._id } },
        }),
    ]);

    return { userWarnCount: (r[1].length ?? 0) + 1 };
}

async function uploadFile(file: any, filename: string): Promise<string> {
    let data = new FormData();
    data.append("file", file, { filename: filename });

    let req = await axios.post(client.configuration?.features.autumn.url + "/attachments", data, {
        headers: data.getHeaders(),
    });
    return (req.data as any)["id"] as string;
}

async function sendLogMessage(config: LogConfig, content: LogMessage) {
    if (config.discord?.webhookUrl) {
        let c = { ...content, ...content.overrides?.discord };

        const embed = new MessageEmbed();
        if (c.title) embed.setTitle(content.title);
        if (c.description) embed.setDescription(c.description);
        if (c.color?.match(/^#[0-9a-fA-F]+$/))
            embed.setColor(c.color as ColorResolvable);
        if (c.fields?.length) {
            for (const field of c.fields) {
                embed.addField(
                    field.title,
                    field.content.trim() || "\u200b",
                    field.inline
                );
            }
        }
        if (content.image) {
            if (content.image.type == "THUMBNAIL")
                embed.setThumbnail(content.image.url);
            else if (content.image.type == "BIG")
                embed.setImage(content.image.url);
        }

        if (content.attachments?.length) {
            embed.setFooter(
                `Attachments: ${content.attachments
                    .map((a) => a.name)
                    .join(", ")}`
            );
        }

        let data = new FormData();
        content.attachments?.forEach((a) => {
            data.append(`files[${ulid()}]`, a.content, { filename: a.name });
        });

        data.append(
            "payload_json",
            JSON.stringify({ embeds: [embed.toJSON()] }),
            { contentType: "application/json" }
        );

        axios
            .post(config.discord.webhookUrl, data, {
                headers: data.getHeaders(),
            })
            .catch((e) =>
                logger.error(`Failed to send log message (discord): ${e}`)
            );
    }

    if (config.revolt?.channel) {
        let c = { ...content, ...content.overrides?.revolt };
        try {
            const channel =
                client.channels.get(config.revolt.channel) ||
                (await client.channels.fetch(config.revolt.channel));

            let message = "";
            let embed: SendableEmbed | undefined = undefined;
            switch (config.revolt.type) {
                case "EMBED":
                    c = { ...c, ...content.overrides?.revoltEmbed };
                    embed = {
                        title: c.title,
                        description: c.description,
                        colour: c.color,
                    };

                    if (c.fields?.length) {
                        for (const field of c.fields) {
                            embed.description += `\n#### ${field.title}\n${field.content}`;
                        }
                    }
                    break;

                default: // QUOTEBLOCK, PLAIN or unspecified
                    // Wrap entire message in quotes
                    // please disregard this mess

                    c = { ...c, ...content.overrides?.revoltQuoteblock };
                    const quote = config.revolt.type == "PLAIN" ? "" : ">";

                    if (c.title) message += `## ${c.title}\n`;
                    if (c.description) message += `${c.description}\n`;
                    if (c.fields?.length) {
                        for (const field of c.fields) {
                            message +=
                                `${quote ? "\u200b\n" : ""}${quote}### ${
                                    field.title
                                }\n` +
                                `${quote}${field.content
                                    .trim()
                                    .split("\n")
                                    .join("\n" + quote)}\n${quote ? "\n" : ""}`;
                        }
                    }

                    message = message
                        .trim()
                        .split("\n")
                        .join("\n" + quote);
                    if (c.image?.url)
                        message += `\n[Attachment](${c.image.url})`;
                    break;
            }

            channel
                .sendMessage({
                    content: message,
                    embeds: embed ? [embed] : undefined,
                    attachments: content.attachments
                        ? await Promise.all(
                              content.attachments?.map((a) =>
                                  uploadFile(a.content, a.name)
                              )
                          )
                        : undefined,
                })
                .catch((e) =>
                    logger.error(`Failed to send log message (revolt): ${e}`)
                );
        } catch (e) {
            logger.error(
                `Failed to send log message in ${config.revolt.channel}: ${e}`
            );
        }
    }
}

/**
 * Attempts to escape a message's markdown content (qoutes, headers, **bold** / *italic*, etc)
 */
function sanitizeMessageContent(msg: string): string {
    let str = "";
    for (let line of msg.split("\n")) {
        line = line.trim();

        if (
            line.startsWith("#") || // headers
            line.startsWith(">") || // quotes
            line.startsWith("|") || // tables
            line.startsWith("*") || // unordered lists
            line.startsWith("-") || // ^
            line.startsWith("+") // ^
        ) {
            line = `\\${line}`;
        }

        // Ordered lists can't be escaped using `\`,
        // so we just put an invisible character \u200b
        if (/^[0-9]+[)\.].*/gi.test(line)) {
            line = `\u200b${line}`;
        }

        for (const char of ["_", "!!", "~", "`", "*", "^", "$"]) {
            line = line.replace(
                new RegExp(`(?<!\\\\)\\${char}`, "g"),
                `\\${char}`
            );
        }

        // Mentions
        line = line.replace(/<@/g, `<\\@`);

        str += line + "\n";
    }

    return str;
}

enum EmbedColor {
    Error = "var(--error)",
    SoftError = "var(--warning)",
    Warning = "var(--warning)",
    Success = "var(--success)",
}

function embed(
    content: string,
    title?: string | null,
    color?: string | EmbedColor
): SendableEmbed {
    return {
        description: content,
        title: title,
        colour: color,
    };
}

function dedupeArray<T>(...arrays: T[][]): T[] {
    const found: T[] = [];

    for (const array of arrays) {
        for (const item of array) {
            if (!found.includes(item)) found.push(item);
        }
    }

    return found;
}

function getMutualServers(user: User) {
    const servers: Server[] = [];
    for (const member of client.serverMembers.entries()) {
        if (member[1].id.user == user.id && member[1].server)
            servers.push(member[1].server);
    }
    return servers;
}

const awaitClient = () =>
    new Promise<void>(async (resolve) => {
        if (!client.user) client.once("ready", () => resolve());
        else resolve();
    });

const getDmChannel = async (user: string | { id: string } | User) => {
    if (typeof user == "string") {
        user = client.users.get(user) || (await client.users.fetch(user));
    }

    if (!(user instanceof User)) {
        user = client.users.get(user.id) || (await client.users.fetch(user.id));
    }

    return (
        Array.from(client.channels.values()).find(
            (c: Channel) =>
                c.type == "DirectMessage" &&
                c.recipient?.id == (user as User).id
        ) || (await (user as User).openDM())
    );
};

const generateInfractionDMEmbed = (
    server: Server,
    serverConfig: ServerConfig,
    infraction: Infraction,
    message: Message
) => {
    const embed: SendableEmbed = {
        title: server.name,
        icon_url: server.icon?.createFileURL({ max_side: 128 }),
        colour: "#ff9e2f",
        url: message.url,
        description:
            "You have been " +
            (infraction.actionType
                ? `**${
                      infraction.actionType == "ban" ? "banned" : "kicked"
                  }** from `
                : `**warned** in `) +
            `'${sanitizeMessageContent(
                server.name
            ).trim()}' <t:${Math.round(infraction.date / 1000)}:R>.\n` +
            `**Reason:** ${infraction.reason}\n` +
            `**Moderator:** [@${sanitizeMessageContent(
                message.author?.username || "Unknown"
            )}](/@${message.authorId})\n` +
            `**Infraction ID:** \`${infraction._id}\`` +
            (infraction.actionType == "ban" && infraction.expires
                ? infraction.expires == Infinity
                    ? "\n**Ban duration:** Permanent"
                    : `\n**Ban expires** <t:${Math.round(
                          infraction.expires / 1000
                      )}:R>`
                : "") +
            (infraction.actionType == "ban"
                ? "\n\n**Reminder:** Circumventing this ban by using another account is a violation of the Revolt [Terms of Service](<https://revolt.chat/terms>) " +
                  "and may result in your accounts getting suspended from the platform."
                : ""),
    };

    if (serverConfig.contact) {
        if (RE_MAILTO_URI.test(serverConfig.contact)) {
            embed.description +=
                `\n\nIf you wish to appeal this decision, you may contact the server's moderation team at ` +
                `[${serverConfig.contact.replace(RE_MAILTO_URI, "")}](${
                    serverConfig.contact
                }).`;
        } else if (RE_HTTP_URI.test(serverConfig.contact)) {
            embed.description += `\n\nIf you wish to appeal this decision, you may do so [here](${serverConfig.contact}).`;
        } else {
            embed.description += `\n\n${serverConfig.contact}`;
        }
    }

    return embed;
};

// Copied from https://github.com/janderedev/feeds-bot/blob/master/src/util.ts
const yesNoMessage = (
    channel: Channel,
    allowedUser: string,
    message: string,
    title?: string,
    messageYes?: string,
    messageNo?: string
): Promise<boolean> =>
    new Promise(async (resolve, reject) => {
        const EMOJI_YES = "✅",
            EMOJI_NO = "❌";
        try {
            const msg = await channel.sendMessage({
                embeds: [
                    {
                        colour: "var(--status-streaming)",
                        title: title,
                        description: message,
                    },
                ],
                interactions: {
                    reactions: [EMOJI_YES, EMOJI_NO],
                    restrict_reactions: true,
                },
            });

            let destroyed = false;
            const cb = async (m: Message, userId: string, emoji: string) => {
                if (m.id != msg.id) return;
                if (userId != allowedUser) return;

                switch (emoji) {
                    case EMOJI_YES:
                        client.removeListener("messageReactionAdd", cb);
                        destroyed = true;
                        resolve(true);
                        msg.edit({
                            embeds: [
                                {
                                    colour: "var(--success)",
                                    title: title,
                                    description: `${EMOJI_YES} ${
                                        messageYes ?? "Confirmed!"
                                    }`,
                                },
                            ],
                        }).catch((e) => console.error(e));
                        break;

                    case EMOJI_NO:
                        client.removeListener("messageReactionAdd", cb);
                        destroyed = true;
                        resolve(false);
                        msg.edit({
                            embeds: [
                                {
                                    colour: "var(--error)",
                                    title: title,
                                    description: `${EMOJI_NO} ${
                                        messageNo ?? "Cancelled."
                                    }`,
                                },
                            ],
                        }).catch((e) => console.error(e));
                        break;

                    default:
                        logger.warn(
                            "Received unexpected reaction: " + emoji
                        );
                }
            };
            client.on("messageReactionAdd", cb);

            setTimeout(() => {
                if (!destroyed) {
                    resolve(false);
                    client.removeListener("messageReactionAdd", cb);
                    msg.edit({
                        embeds: [
                            {
                                colour: "var(--error)",
                                title: title,
                                description: `${EMOJI_NO} Timed out`,
                            },
                        ],
                    }).catch((e) => console.error(e));
                }
            }, 30000);
        } catch (e) {
            reject(e);
        }
    });

// Get all cached members of a server. Whoever put STRINGIFIED JSON as map keys is now on my hit list.
const getMembers = (id: string) =>
    Array.from(client.serverMembers.entries())
        .filter((item) => item[0].includes(`"${id}"`))
        .map((entry) => entry[1]);

const memberRanking = (member: ServerMember) => {
    const inferior = (member.server?.member?.ranking ?? Infinity) < member.ranking;
    const kickable = member.server?.havePermission('KickMembers') && inferior;
    const bannable = member.server?.havePermission('BanMembers') && inferior;

    return { inferior, kickable, bannable }
}

export {
    getOwnMemberInServer,
    isModerator,
    isBotManager,
    getPermissionLevel,
    getPermissionBasedOnRole,
    parseUser,
    parseUserOrId,
    storeInfraction,
    uploadFile,
    sanitizeMessageContent,
    sendLogMessage,
    embed,
    dedupeArray,
    awaitClient,
    getMutualServers,
    getDmChannel,
    generateInfractionDMEmbed,
    yesNoMessage,
    getMembers,
    memberRanking,
    EmbedColor,
    NO_MANAGER_MSG,
    ULID_REGEX,
    USER_MENTION_REGEX,
    CHANNEL_MENTION_REGEX,
};
