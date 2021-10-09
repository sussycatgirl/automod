import Command from "../../struct/Command";
import logger from "../logger";
import { client } from "../../index";
import fs from 'fs';
import path from 'path';
import ServerConfig from "../../struct/ServerConfig";

const DEFAULT_PREFIX = process.env['PREFIX'] ?? '/';

let commands: Command[] = fs.readdirSync(path.join(__dirname, '..', 'commands'))
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(__dirname, '..', 'commands', file)).default as Command);

client.on('message', async message => {
    logger.debug(`Message -> ${message.content}`);
    if (typeof message.content != 'string' || message.author_id == client.user?._id || !message.channel) return;

    let config: ServerConfig = (await client.db.get('servers').findOne({ 'id': message.channel?.server_id })) ?? {};
    let guildPrefix = config.prefix ?? DEFAULT_PREFIX;

    let args = message.content.split(' ');
    let cmdName = args.shift() ?? '';

    if (cmdName.startsWith(`<@${client.user?._id}>`)) {
        cmdName = cmdName.substr(`<@${client.user?._id}>`.length);
        if (!cmdName) cmdName = args.shift() ?? ''; // Space between mention and command name
    } else if (cmdName.startsWith(guildPrefix)) {
        cmdName = cmdName.substr(guildPrefix.length);
        if (config.spaceAfterPrefix && !cmdName) cmdName = args.shift() ?? '';
    }

    if (!cmdName) return;

    let cmd = commands.find(c => c.name == cmdName || (c.aliases?.indexOf(cmdName!) ?? -1) > -1);
    if (!cmd) return;

    logger.info(`Command: ${message.author?.username} in ${message.channel?.server?.name}: ${message.content}`);

    if (cmd.serverOnly && !message.channel?.server) {
        return message.reply('This command is not available in direct messages.');
    }

    try {
        cmd.run(message, args);
    } catch(e) {
        message.reply(`### An error has occurred:\n\`\`\`js\n${e}\n\`\`\``);
    }
});

export { DEFAULT_PREFIX }
