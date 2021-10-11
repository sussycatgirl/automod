import { Message } from "revolt.js/dist/maps/Messages";
import { User } from "revolt.js/dist/maps/Users";
import { client } from "../..";
import Command from "../../struct/Command";
import ServerConfig from "../../struct/ServerConfig";
import { isBotManager, NO_MANAGER_MSG, parseUser } from "../util";

const SYNTAX = '';

export default {
    name: 'whitelist',
    aliases: [],
    description: 'Allow users or roles to bypass moderation rules',
    syntax: SYNTAX,
    run: async (message: Message, args: string[]) => {
        let config: ServerConfig = await client.db.get('servers').findOne({ id: message.channel?.server_id }) || {}
        if (!config.whitelist) config.whitelist = { users: [], roles: [], managers: true }

        if (!isBotManager(message.member!)) return message.reply(NO_MANAGER_MSG);

        let user: User|null, role: string|undefined;
        switch(args[0]?.toLowerCase()) {
            case 'add':
            case 'set':
                if (!args[1]) return message.reply('You need to spefify a user or role name.');

                role = Object.entries(message.channel?.server?.roles ?? {})
                .find((r) => r[1].name?.toLowerCase() == args[1].toLowerCase()
                    || r[0] == args[1].toUpperCase())
                ?.[0];

                if (role) {
                    if (config.whitelist!.roles?.includes(role))
                        return message.reply('That role is already whitelisted.');

                    config.whitelist!.roles = [role, ...(config.whitelist!.roles ?? [])];
                    await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { whitelist: config.whitelist } });
                    return message.reply(`Added role to whitelist!`);
                }

                user = await parseUser(args[1])
                if (user == null) return message.reply('I can\'t find that user or role.');
                if (user.bot != null) return message.reply('Bots cannot be whitelisted.');
                if (config.whitelist!.users?.includes(user._id))
                    return message.reply('That user is already whitelisted.');

                config.whitelist!.users = [user._id, ...(config.whitelist!.users ?? [])];
                await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { whitelist: config.whitelist } });
                return message.reply('Added user to whitelist!');
            break;
            case 'rm':
            case 'del':
            case 'remove':
            case 'delete':
                if (!args[1]) return message.reply('You need to spefify a user or role name.');

                role = Object.entries(message.channel?.server?.roles ?? {})
                .find((r) => r[1].name?.toLowerCase() == args[1].toLowerCase()
                    || r[0] == args[1].toUpperCase())
                ?.[0];

                if (role) {
                    if (!config.whitelist!.roles?.includes(role))
                        return message.reply('That role is not whitelisted.');

                    config.whitelist!.roles = config.whitelist!.roles.filter(r => r != role);
                    await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { whitelist: config.whitelist } });
                    return message.reply(`Removed role from whitelist!`);
                }

                user = await parseUser(args[1])
                if (user == null) return message.reply('I can\'t find that user or role.');
                if (!config.whitelist!.users?.includes(user._id))
                    return message.reply('That user is not whitelisted.');

                config.whitelist!.users = config.whitelist!.users.filter(u => u != user?._id);
                await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { whitelist: config.whitelist } });
                return message.reply('Removed user from whitelist!');
            break;
            case 'l':
            case 'ls':
            case 'list':
            case 'show':
                let str = `## Whitelisted users\n`
                        + `### Users\n`;

                if (config.whitelist.users?.length) {
                    config.whitelist.users?.forEach((u, index) => {
                        if (index < 15) str += `* <@${u}>\n`;
                        if (index == 15) str += `**${index - 15} more user${config.whitelist?.users?.length == 16 ? '' : 's'}**\n`;
                    });
                } else str += `**No whitelisted users**\n`;

                str += `\u200b\n### Roles\n`;

                if (config.whitelist.roles?.length) {
                    config.whitelist.roles
                        ?.map(r => message.channel?.server?.roles?.[r]?.name || `Unknown role (${r})`)
                        .forEach((r, index) => {
                        if (index < 15) str += `* ${r}\n`;
                        if (index == 15) str += `**${config.whitelist!.roles!.length - 15} more role${config.whitelist?.roles?.length == 16 ? '' : 's'}**\n`;
                    });
                } else str += `**No whitelisted roles**\n`;

                str += `\u200b\nAdmins and bot managers: **${config.whitelist.managers === false ? 'No' : 'Yes'}**`;

                message.reply(str)
                    ?.catch(e => message.reply(String(e)));
            break;
            default:
                message.reply(`Command syntax: ${SYNTAX}`);
        }
    }
} as Command;
