import Command from "../../struct/Command";
import logger from "../logger";
import { client } from "../../index";
import fs from 'fs';
import path from 'path';

const DEFAULT_PREFIX = process.env['PREFIX'] ?? '/';

let commands: Command[] = fs.readdirSync(path.join(__dirname, '..', 'commands'))
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(__dirname, '..', 'commands', file)).default as Command);

client.on('message', async message => {
    logger.debug(`Message -> ${message.content}`);
    if (typeof message.content != 'string') return; // Ignore system messages

    if (!message.content.startsWith(DEFAULT_PREFIX)) return;

    let args = message.content.split(' ');
    let cmdName = args.shift()?.substr(DEFAULT_PREFIX.length);
    if (!cmdName) return;

    let cmd = commands.find(c => c.name == cmdName || (c.aliases?.indexOf(cmdName!) ?? -1) > -1);
    if (!cmd) return;

    if (cmd.serverOnly && !message.channel?.server) {
        return message.reply('This command is not available in direct messages.');
    }

    try {
        cmd.run(message, args);
    } catch(e) {
        message.reply(`### An error has occurred:\n\`\`\`js\n${e}\n\`\`\``);
    }
});
