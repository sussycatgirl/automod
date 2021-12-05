import Command from "../../struct/Command";
import logger from "../logger";
import { client } from "../../index";
import fs from 'fs';
import path from 'path';
import ServerConfig from "../../struct/ServerConfig";
import { antispam } from "./antispam";
import checkCustomRules from "./custom_rules/custom_rules";
import MessageCommandContext from "../../struct/MessageCommandContext";

const DEFAULT_PREFIX = process.env['PREFIX']
                    ?? process.env['BOT_PREFIX']
                    ?? process.env['COMMAND_PREFIX']
                    ?? '/';

let commands: Command[] = fs.readdirSync(path.join(__dirname, '..', 'commands'))
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(__dirname, '..', 'commands', file)).default as Command);

client.on('message', async msg => {
    logger.debug(`Message -> ${msg.content}`);

    if (typeof msg.content != 'string' ||
        msg.author_id == client.user?._id ||
        !msg.channel?.server) return;

    // Send message through anti spam check and custom rules
    if (!await antispam(msg)) return;
    checkCustomRules(msg);

    let args = msg.content.split(' ');
    let cmdName = args.shift() ?? '';
    
    let config: ServerConfig = (await client.db.get('servers').findOne({ 'id': msg.channel?.server_id })) ?? {};
    let guildPrefix = config.prefix ?? DEFAULT_PREFIX;

    if (cmdName.startsWith(`<@${client.user?._id}>`)) {
        cmdName = cmdName.substr(`<@${client.user?._id}>`.length);
        if (!cmdName) cmdName = args.shift() ?? ''; // Space between mention and command name
    } else if (cmdName.startsWith(guildPrefix)) {
        cmdName = cmdName.substr(guildPrefix.length);
        if (config.spaceAfterPrefix && !cmdName) cmdName = args.shift() ?? '';
    } else return;

    if (!cmdName) return;

    let cmd = commands.find(c => c.name == cmdName || (c.aliases?.indexOf(cmdName!) ?? -1) > -1);
    if (!cmd) return;

    let ownerIDs = process.env['BOT_OWNERS'] ? process.env['BOT_OWNERS'].split(',') : [];
    if (cmd.restrict == 'BOTOWNER' && ownerIDs.indexOf(msg.author_id) == -1) {
        logger.warn(`User ${msg.author?.username} tried to run owner-only command: ${cmdName}`);
        msg.reply('🔒 Access denied');
        return;
    }

    let serverCtx = msg.channel?.server;

    if (config.linkedServer) {
        try {
            serverCtx = client.servers.get(config.linkedServer)
                || await client.servers.fetch(config.linkedServer);
        } catch(e) {
            msg.reply(`# Error\n` +
                      `Failed to fetch linked server. This command will be executed in the context of this server.\n\n` +
                      `Error: \`\`\`js\n${e}\n\`\`\``);
        }
    }

    let message: MessageCommandContext = msg as MessageCommandContext;
    message.serverContext = serverCtx;

    logger.info(`Command: ${message.author?.username} in ${message.channel?.server?.name}: ${message.content}`);

    // Create document for server in DB, if not already present
    if (JSON.stringify(config) == '{}') await client.db.get('servers').insert({ id: message.channel?.server_id });

    if (cmd.removeEmptyArgs !== false) {
        args = args.filter(a => a.length > 0);
    }

    try {
        cmd.run(message, args);
    } catch(e) {
        message.reply(`### An error has occurred:\n\`\`\`js\n${e}\n\`\`\``);
    }
});

export { DEFAULT_PREFIX }
