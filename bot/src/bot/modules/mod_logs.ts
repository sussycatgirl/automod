import { Server, ServerMember } from "revolt.js";
import { client, dbs } from "../..";
import LogMessage from "automod/dist/types/LogMessage";
import Xlsx from 'xlsx';
import logger from "../logger";
import { sanitizeMessageContent, sendLogMessage } from "../util";

// the `packet` event is emitted before the client's cache
// is updated, which allows us to get the old message content
// if it was cached before
client.on('messageUpdate', async (message, oldMessage) => {
    try {
        if (!message.content) return;

        if (message.authorId == client.user?.id) return;

        let oldMsgRaw = String(oldMessage.content ?? '(Unknown)');
        let newMsgRaw = String(message.content);
        let oldMsg = sanitizeMessageContent(oldMsgRaw) || '(Empty)';
        let newMsg = sanitizeMessageContent(newMsgRaw) || '(Empty)';

        let channel = message.channel;
        let server = channel?.server;
        if (!server || !channel) return logger.warn('Received message update in unknown channel or server');
        if (oldMsg == newMsg) return logger.info('Ignoring message update without edited text');

        let config = await dbs.SERVERS.findOne({ id: server.id });
        if (config?.logs?.messageUpdate) {
            const attachFullMessage = oldMsg.length > 800 || newMsg.length > 800;
            let embed: LogMessage = {
                title: `Message edited in ${server.name}`,
                description:
                    `[#${channel.name}](/server/${server.id}/channel/${channel.id}) | ` +
                    `<@${message.authorId}> | ` +
                    `[Jump to message](/server/${server.id}/channel/${channel.id}/${message.id})`,
                fields: [],
                color: "#829dff",
                overrides: {
                    discord: {
                        description: `Author: @${
                            message.author?.username || message.authorId || "Unknown"
                        } | Channel: ${channel.name || channel.id}`,
                    },
                },
            };

            if (attachFullMessage) {
                embed.attachments = [
                    { name: 'old_message.txt', content: Buffer.from(oldMsgRaw) },
                    { name: 'new_message.txt', content: Buffer.from(newMsgRaw) },
                ];
            } else {
                embed.fields!.push({ title: 'Old content', content: oldMsg });
                embed.fields!.push({ title: 'New content', content: newMsg });
            }

            await sendLogMessage(config.logs.messageUpdate, embed);
        }
    } catch(e) {
        console.error(e);
    }
});
client.on('messageDelete', async (message) => {
    try {
        let channel = client.channels.get(message.channelId);
        let author = message.authorId ? client.users.get(message.authorId) : null;
        if (!channel) return;

        let msgRaw = String(message.content ?? '(Unknown)');
        let msg = sanitizeMessageContent(msgRaw);

        let config = await dbs.SERVERS.findOne({ id: channel?.server?.id });
        if (config?.logs?.messageUpdate) {
            let embed: LogMessage = {
                title: `Message deleted in ${channel?.server?.name}`,
                description: `[#${channel.name}](/server/${channel.serverId}/channel/${channel.id}) | `
                            + `<@${message.authorId}> | `
                            + `[\\[Jump to context\\]](/server/${channel.serverId}/channel/${channel.id}/${message.id})`,
                fields: [],
                color: '#ff6b6b',
                overrides: {
                    discord: {
                        description: `Author: @${author?.username || message.authorId} | Channel: ${channel?.name || message.channelId}`
                    },
                }
            }

            if (msg.length > 1000) {
                embed.attachments?.push({ name: 'message.txt', content: Buffer.from(msgRaw) });
            } else {
                embed.fields!.push({ title: 'Content', content: msg || "(Empty)" });
            }

            if (message.attachments?.length) {
                let autumnURL = client.configuration?.features.autumn.url;
                embed.fields!.push({ title: 'Attachments', content: message.attachments.map(a => 
                    `[\\[${a.filename}\\]](<${autumnURL}/${a.tag}/${a.id}/${a.filename}>)`).join(' | ') })
            }

            await sendLogMessage(config.logs.messageUpdate, embed);
        }
    } catch(e) {
        console.error(e);
    }
});

client.on('messageDeleteBulk', async (messages) => {
    const channel = client.channels.get(messages[0].channelId);
    if (!channel) return;

    try {
        let config = await dbs.SERVERS.findOne({ id: channel.serverId });
        if (config?.logs?.messageUpdate) {
            const data: String[][] = [
                ['Message ID', 'Author ID', 'Author Name', 'Content', 'Attachment URLs'],
                [],
            ];

            for (const message of messages) {
                data.push([
                    message.id,
                    message.authorId ?? '',
                    message.authorId ? client.users.get(message.authorId)?.username ?? '' : '',
                    message.content ?? '',
                    message.attachments?.map(a => a.id).join(', ') ?? '',
                ]);
            }

            const sheet = Xlsx.utils.aoa_to_sheet(data);
            const csv = Xlsx.utils.sheet_to_csv(data);

            let embed: LogMessage = {
                title: `Bulk delete in ${channel.server?.name}`,
                description: `${messages.length} messages deleted in ` + 
                    `[#${channel.name}](/server/${channel.serverId}/channel/${channel.id})`,
                fields: [],
                attachments: [{ name: 'messages.csv', content: Buffer.from(csv) }],
                color: '#ff392b',
                overrides: {
                    discord: {
                        description: `${messages.length} messages deleted in #${channel.name}`,
                    }
                }
            }

            await sendLogMessage(config.logs.messageUpdate, embed);
        }
    } catch(e) {
        console.error(e);
    }
});

async function logModAction(type: 'warn'|'kick'|'ban'|'votekick', server: Server, mod: ServerMember, target: string, reason: string|null, infractionID: string, extraText?: string): Promise<void> {
    try {
        let config = await dbs.SERVERS.findOne({ id: server.id });

        if (config?.logs?.modAction) {
            let aType = type == 'ban' ? 'banned' : type + 'ed';
            let embedColor = '#0576ff';
            if (type == 'kick') embedColor = '#ff861d';
            if (type == 'ban') embedColor = '#ff2f05';

            sendLogMessage(config.logs.modAction, {
                title: `User ${aType}`,
                description: `\`@${mod.user?.username}\` **${aType}** \``
                           + `${await fetchUsername(target)}\`${type == 'warn' ? '.' : ` from ${server.name}.`}\n`
                           + `**Reason**: \`${reason ? reason : 'No reason provided.'}\`\n`
                           + `**Warn ID**: \`${infractionID}\`\n`
                           + (extraText ?? ''),
                color: embedColor,
                overrides: {},
            });
        }
    } catch(e) {
        console.error(e);
    }
}


let fetchUsername = async (id: string, fallbackText?: string) => {
    try {
        let u = client.users.get(id) || await client.users.fetch(id);
        return `@${u.username}`;
    } catch(e) { return fallbackText || 'Unknown user' }
}

export { fetchUsername, logModAction }
