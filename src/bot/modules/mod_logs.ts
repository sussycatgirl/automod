import { client } from "../..";
import ServerConfig from "../../struct/ServerConfig";
import logger from "../logger";
import { getAutumnURL, sanitizeMessageContent, uploadFile } from "../util";

// the `packet` event is emitted before the client's cache
// is updated, which allows us to get the old message content
// if it was cached before
client.on('packet', async (packet) => {
    if (packet.type == 'MessageUpdate') {
        try {
            if (!packet.data.content) return;

            logger.debug('Message updated');

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
            if (!config?.logs?.messageUpdate) return;
            let logChannelID = config.logs.messageUpdate;
            let logChannel = client.channels.get(logChannelID);
            if (!logChannel) return logger.debug('Log channel deleted or not cached: ' + logChannelID);

            let attachFullMessage = oldMsg.length > 800 || newMsg.length > 800;

            if (attachFullMessage) {
                logChannel.sendMessage({
                    content: `### Message edited in ${server.name}\n`
                        + `[\\[Jump to message\\]](/server/${server._id}/channel/${channel._id}/${packet.id})\n`,
                    attachments: await Promise.all([
                        uploadFile(oldMsgRaw, 'Old message'),
                        uploadFile(newMsgRaw, 'New message'),
                    ]),
                });
            } else {
                let logMsg = `### Message edited in ${server.name}\n`
                    + `[\\[Jump to message\\]](/server/${server._id}/channel/${channel._id}/${packet.id}) | `
                    + `[\\[Author\\]](/@${m?.author_id})\n`;
                logMsg += `#### Old Content\n${oldMsg}\n`;
                logMsg += `#### New Content\n${newMsg}`;

                logChannel.sendMessage(logMsg)
                    .catch(() => logger.warn(`Failed to send log message`));
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
            if (!config?.logs?.messageUpdate) return;
            let logChannelID = config.logs.messageUpdate;
            let logChannel = client.channels.get(logChannelID);
            if (!logChannel) return logger.debug('Log channel deleted or not cached: ' + logChannelID);

            if (msg.length > 1000) {
                let logMsg = `### Message deleted in ${message.channel?.server?.name}\n`;

                if (message.attachments?.length) {
                    let autumnURL = await getAutumnURL();

                    logMsg += `\n\u200b\n#### Attachments\n` + message.attachments.map(a => 
                        `[\\[${a.filename}\\]](<${autumnURL}/${a.tag}/${a._id}/${a.filename}>)`).join(' | ');
                }

                logChannel.sendMessage({
                    content: logMsg,
                    attachments: [ await uploadFile(msgRaw, 'Message content') ],
                })
                    .catch(() => logger.warn(`Failed to send log message`));
            } else {
                let logMsg = `### Message deleted in ${channel.server?.name}\n`
                + `[\\[Jump to channel\\]](/server/${channel.server?._id}/channel/${channel._id}) | `
                    + `[\\[Author\\]](/@${message.author_id})\n`
                + `#### Message content\n`
                + msg;

                if (message.attachments?.length) {
                    let autumnURL = await getAutumnURL();

                    logMsg += `\n\u200b\n#### Attachments\n` + message.attachments.map(a => 
                        `[\\[${a.filename}\\]](<${autumnURL}/${a.tag}/${a._id}/${a.filename}>)`).join(' | ');
                }

                logChannel.sendMessage(logMsg)
                    .catch(() => logger.warn(`Failed to send log message`));
            }
        } catch(e) {
            console.error(e);
        }
    }
});
