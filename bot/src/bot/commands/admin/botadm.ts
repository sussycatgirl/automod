import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { client, dbs } from "../../..";
import { commands, DEFAULT_PREFIX, ownerIDs } from "../../modules/command_handler";
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import { User } from "revolt.js";
import { adminBotLog } from "../../logging";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { getMutualServers, parseUserOrId } from "../../util";

const BLACKLIST_BAN_REASON = `This user is globally blacklisted and has been banned automatically. If you wish to opt out of the global blacklist, run '/botctl ignore_blacklist yes'.`;
const BLACKLIST_MESSAGE = (username: string) => `\`@${username}\` has been banned automatically. Check the ban reason for more info.`;

// id: expireDate
const sudoOverrides: { [key: string]: number|null } = {}

const isSudo = (user: User): boolean => {
    return !!(sudoOverrides[user.id] && sudoOverrides[user.id]! > Date.now());
}

const updateSudoTimeout = (user: User) => {
    sudoOverrides[user.id] = Date.now() + (1000 * 60 * 5);
}

const getCommitHash = (): Promise<string|null> => new Promise((resolve) => {
    child_process.exec('git rev-parse HEAD', (err, stdout) => {
        if (err?.code) resolve(null); else resolve(stdout);
    });
});

const SUBCOMMANDS: string[] = [
    'stats',
    'sudo',
    'userinfo',
    'blacklist',
    'unblacklist',
    'blacklistreason',
    'ignore',
    'unignore',
];

export default {
    name: 'botadm',
    aliases: [ 'botadmin' ],
    description: 'Bot administration',
    removeEmptyArgs: true,
    restrict: 'BOTOWNER',
    category: CommandCategory.Owner,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!args.length) return message.reply('No subcommand specified. Available subcommands: ' + SUBCOMMANDS.join(', '));

        try {
            switch(args.shift()?.toLowerCase()) {
                case 'stats': {
                    const pjson = JSON.parse((await fs.promises.readFile(path.join(process.cwd(), 'package.json'))).toString());
                    let msg = `# AutoMod stats\n`
                            + `### Cache\n`
                            + `Servers: \`${client.servers.size()}\`\n`
                            + `Channels: \`${client.channels.size()}\`\n`
                            + `Users: \`${client.users.size()}\`\n`
                            + `### Misc\n`
                            + `Command count: \`${commands.length}\`\n`
                            + `Environment: \`${process.env.NODE_ENV || 'testing'}\`\n`
                            + `Commit hash: \`${await getCommitHash() || 'Unknown'}\`\n`
                            + `### Packages\n`
                            + `revolt.js: \`${pjson.dependencies['revolt.js']}\`\n`
                            + `discord.js: \`${pjson.dependencies['discord.js']}\`\n`
                            + `axios: \`${pjson.dependencies['axios']}\`\n`
                            + `log75: \`${pjson.dependencies['log75']}\`\n`
                            + `typescript: \`${pjson.devDependencies['typescript']}\`\n`
                            + `### Connection\n`
                            + `API Endpoint: \`${client.options.baseURL}\`\n`
                            + `Ping: \`${client.events.ping() ?? 'Unknown'}\`\n`
                            + `### Bot configuration\n`
                            + `Owners: \`${ownerIDs.length}\` (${ownerIDs.join(', ')})\n`;

                    await message.reply(msg, false);
                    break;
                }

                case 'sudo': {
                    switch(args[0]?.toLowerCase()) {
                        case 'enable':
                        case 'on': {
                            if (isSudo(message.author!)) return message.reply('You are already in sudo mode!');

                            sudoOverrides[message.authorId!] = Date.now() + (1000 * 60 * 5);

                            let msg = `# %emoji% Sudo mode enabled\n`
                                    + `In sudo mode, you will be able to run any command regardless of your server permissions.\n`
                                    + `Sudo mode will automatically expire **5 minutes** after your last bot interaction. `
                                    + `To disable now, run \`${DEFAULT_PREFIX}botadm sudo disable\`.`;

                            const sentMsg = await message.reply(msg.replace('%emoji%', ':lock:'), false);
                            setTimeout(() => sentMsg?.edit({ content: msg.replace('%emoji%', ':unlock:') }).catch(()=>{}), 200);

                            await adminBotLog({ type: 'WARN', message: `@${message.author!.username} has enabled sudo mode.` });

                            break;
                        }

                        case 'disable':
                        case 'off': {
                            if (!isSudo(message.author!)) return message.reply('You currently not in sudo mode.');

                            sudoOverrides[message.authorId!] = null;

                            let msg = `# %emoji% Sudo mode disabled.`;
                            const sentMsg = await message.reply(msg.replace('%emoji%', ':unlock:'), false);
                            setTimeout(() => sentMsg?.edit({ content: msg.replace('%emoji%', ':lock:') }).catch(()=>{}), 200);
                            break;
                        }

                        case null:
                        case undefined:
                        case '': {
                            let msg = `# :unlock: Sudo mode\n`
                                    + `Sudo mode allows bot owners to bypass all permission checks for a limited time. `
                                    + `After activating, you will be able to run any command regardless of your server permissions.\n\n`
                                    + `To enable, run \`${DEFAULT_PREFIX}botadm sudo enable\`.\n`
                                    + `It will automatically be deactivated **5 minutes** after your last bot interaction.`;

                            await message.reply(msg, false);
                            break;
                        }

                        default:
                            await message.reply('sudo: Unknown subcommand');
                    }

                    break;
                }

                case 'userinfo': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');

                    const res = await dbs.USERS.findOne({ id: target.id });

                    if (!res) await message.reply(`Nothing stored about this user.`);
                    else await message.reply(`\`\`\`json\n${JSON.stringify(res, null, 4)}\n\`\`\``);

                    break;
                }

                case 'blacklist': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');
                    if (target.id == message.authorId) return message.reply(`no`);

                    await dbs.USERS.update({
                        id: target.id,
                    }, {
                        $setOnInsert: { id: target.id },
                        $set: { globalBlacklist: true }
                    }, { upsert: true });

                    try {
                        // Ban the user from all shared servers (unless those who opted out)
                        if (target instanceof User) {
                            const msg = await message.reply(`User update stored.`);
                            let bannedServers = 0;

                            const mutuals = getMutualServers(target);
                            for (const server of mutuals) {
                                if (server.havePermission('BanMembers')) {
                                    const config = await dbs.SERVERS.findOne({ id: server.id });
                                    if (config?.allowBlacklistedUsers) continue;

                                    try {
                                        await server.banUser(target.id, {
                                            reason: BLACKLIST_BAN_REASON,
                                        });
                                        bannedServers++;

                                        if (server.systemMessages?.user_banned) {
                                            const channel = server.channels.find(c => c!.id == server.systemMessages!.user_banned);
                                            if (channel && channel.havePermission('SendMessage')) {
                                                await channel.sendMessage(BLACKLIST_MESSAGE(target.username));
                                            }
                                        }
                                    } catch(e) {
                                        console.error(`Failed to ban in ${server.id}: ${e}`);
                                    }
                                }
                            }

                            if (bannedServers) {
                                msg?.edit({ content: `User update stored. User has been banned from ${bannedServers} servers.` });
                            }
                        } else await message.reply(`User update stored. No servers are currently shared with this user.`);
                    } catch(e) {
                        console.error(''+e);
                        await message.reply(`Failed to ban target from mutual servers: ${e}\n`);
                    }

                    break;
                }

                case 'unblacklist': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');

                    await dbs.USERS.update({
                        id: target.id,
                    }, {
                        $setOnInsert: { id: target.id },
                        $set: { globalBlacklist: false }
                    }, { upsert: true });

                    await message.reply(`User update stored. Existing bans will not be lifted automatically.`);

                    break;
                }

                case 'blacklistreason': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');

                    await dbs.USERS.update({
                        id: target.id,
                    }, {
                        $setOnInsert: { id: target.id },
                        $set: { blacklistReason: args.join(' ') || undefined }
                    }, { upsert: true });

                    await message.reply(`User update stored.`);

                    break;
                }

                case 'ignore': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');
                    if (target.id == message.authorId) return message.reply(`no`);

                    await dbs.USERS.update(
                        { id: target.id },
                        {
                            $setOnInsert: { id: target.id },
                            $set: { ignore: true },
                        },
                        { upsert: true }
                    );

                    await message.reply(`User update stored.`);

                    break;
                }

                case 'unignore': {
                    const target = await parseUserOrId(args.shift() || '');
                    if (!target) return message.reply('Specified user could not be found.');
                    if (target.id == message.authorId) return message.reply(`no`);

                    await dbs.USERS.update(
                        { id: target.id },
                        {
                            $setOnInsert: { id: target.id },
                            $set: { ignore: false },
                        },
                        { upsert: true }
                    );

                    await message.reply(`User update stored.`);

                    break;
                }

                default:
                    message.reply('Unknown subcommand. Available subcommands: ' + SUBCOMMANDS.join(', '));
            }
        } catch(e) { console.error(e) }
    }
} as SimpleCommand;

export { isSudo, updateSudoTimeout, BLACKLIST_BAN_REASON, BLACKLIST_MESSAGE }
