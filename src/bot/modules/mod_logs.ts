import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import { Server } from "@janderedev/revolt.js/dist/maps/Servers";
import { client } from "../..";
import Infraction from "../../struct/antispam/Infraction";
import LogMessage from "../../struct/LogMessage";
import ServerConfig from "../../struct/ServerConfig";
import logger from "../logger";
import { getAutumnURL, sanitizeMessageContent, sendLogMessage } from "../util";

// the `packet` event is emitted before the client's cache
// is updated, which allows us to get the old message content
// if it was cached before
client.on('packet', async (packet) => {
    if (packet.type == 'MessageUpdate') {
        try {
            if (!packet.data.content) return;

            let m = client.messages.get(packet.id);

            if (m?.author_id == client.user?._id) return;

            let oldMsgRaw = String(m?.content ?? '(Unknown)');
            let newMsgRaw = String(packet.data.content);
            let oldMsg = sanitizeMessageContent(oldMsgRaw) || '(Empty)';
            let newMsg = sanitizeMessageContent(newMsgRaw) || '(Empty)';

            let channel = client.channels.get(packet.channel);
            let server = channel?.server;
            if (!server || !channel) return logger.warn('Received message update in unknown channel or server');

            let config: ServerConfig = await client.db.get('servers').findOne({ id: server._id }) ?? {};
            if (config?.logs?.messageUpdate) {
                const attachFullMessage = oldMsg.length > 800 || newMsg.length > 800;
                let embed: LogMessage = {
                    title: `Message edited in ${server.name}`,
                    description: `[\\[#${channel.name}\\]](/server/${server._id}/channel/${channel._id}) | `
                               + `[\\[Author\\]](/@${m?.author_id}) | `
                               + `[\\[Jump to message\\]](/server/${server._id}/channel/${channel._id}/${packet.id})`,
                    fields: [],
                    color: '#829dff',
                    overrides: {
                        discord: {
                            description: `Author: @${m?.author?.username || m?.author_id || "Unknown"} | Channel: ${channel?.name || channel?._id}`
                        },
                        revoltRvembed: {
                            description: `Author: @${m?.author?.username || m?.author_id || "Unknown"} | Channel: ${channel?.name || channel?._id}`
                        }
                    }
                }

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
    }

    if (packet.type == 'MessageDelete') {
        try {
            let channel = client.channels.get(packet.channel);
            if (!channel) return;
            let message = client.messages.get(packet.id);
            if (!message) return;

            let msgRaw = String(message.content ?? '(Unknown)');
            let msg = sanitizeMessageContent(msgRaw);

            let config: ServerConfig = await client.db.get('servers').findOne({ id: message.channel?.server?._id }) ?? {};
            if (config.logs?.messageUpdate) {
                let embed: LogMessage = {
                    title: `Message deleted in ${message.channel?.server?.name}`,
                    description: `[\\[#${channel.name}\\]](/server/${channel.server_id}/channel/${channel._id}) | `
                               + `[\\[Author\\]](/@${message.author_id}) | `
                               + `[\\[Jump to context\\]](/server/${channel.server_id}/channel/${channel._id}/${packet.id})`,
                    fields: [],
                    color: '#ff6b6b',
                    overrides: {
                        discord: {
                            description: `Author: @${message.author?.username || message.author_id} | Channel: ${message.channel?.name || message.channel_id}`
                        },
                        revoltRvembed: {
                            description: `Author: @${message.author?.username || message.author_id} | Channel: ${message.channel?.name || message.channel_id}`
                        }
                    }
                }

                if (msg.length > 1000) {
                    embed.attachments?.push({ name: 'message.txt', content: Buffer.from(msgRaw) });
                } else {
                    embed.fields!.push({ title: 'Content', content: msg || "(Empty)" });
                }

                if (message.attachments?.length) {
                    let autumnURL = await getAutumnURL();
                    embed.fields!.push({ title: 'Attachments', content: message.attachments.map(a => 
                        `[\\[${a.filename}\\]](<${autumnURL}/${a.tag}/${a._id}/${a.filename}>)`).join(' | ') })
                }

                await sendLogMessage(config.logs.messageUpdate, embed);
            }
        } catch(e) {
            console.error(e);
        }
    }
});

async function logModAction(type: 'warn'|'kick'|'ban', server: Server, mod: Member, target: string, reason: string|null, infraction: Infraction, extraText?: string): Promise<void> {
    try {
        let config: ServerConfig = await client.db.get('servers').findOne({ id: server._id }) ?? {};

        if (config.logs?.modAction) {
            let aType = type == 'ban' ? 'banned' : type + 'ed';
            let embedColor = '#0576ff';
            if (type == 'kick') embedColor = '#ff861d';
            if (type == 'ban') embedColor = '#ff2f05';


            sendLogMessage(config.logs.modAction, {
                title: `User ${aType}`,
                description: `\`@${mod.user?.username}\` **${aType}** \``
                           + `${await fetchUsername(target)}\`${type == 'warn' ? '.' : ` from ${server.name}.`}\n`
                           + `**Reason**: \`${reason ? reason : 'No reason provided.'}\`\n`
                           + `**Warn ID**: \`${infraction._id}\`\n`
                           + (extraText ?? ''),
                color: embedColor,
                overrides: {
                    revoltRvembed: {
                        description: `@${mod.user?.username} ${aType} `
                           + `${await fetchUsername(target)}${type == 'warn' ? '.' : ` from ${server.name}.`}\n`
                           + `Reason: ${reason ? reason : 'No reason provided.'}\n`
                           + `Warn ID: ${infraction._id}\n`
                           + (extraText ?? ''),
                    }
                }
            });
        }
    } catch(e) {
        console.error(e);
    }
}


let fetchUsername = async (id: string) => {
    try {
        let u = client.users.get(id) || await client.users.fetch(id);
        return `@${u.username}`;
    } catch(e) { return 'Unknown user' }
}

export { fetchUsername, logModAction }
