import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { hasPerm, parseUser } from "../util";
import ServerConfig from "../../struct/ServerConfig";
import { client } from "../..";
import { User } from "@janderedev/revolt.js/dist/maps/Users";

const SYNTAX = '/admin add @user; /admin remove @user; /admin list';

export default {
    name: 'admin',
    aliases: [ 'admins', 'manager', 'managers' ],
    description: 'Allow users to control the bot\'s configuration',
    syntax: SYNTAX,
    run: async (message: Message, args: string[]) => {
        if (!hasPerm(message.member!, 'ManageServer'))
            return message.reply('You need **ManageServer** permission to use this command.');

        let config: ServerConfig = (await client.db.get('servers').findOne({ id: message.channel?.server_id })) ?? {};
        let admins = config.botManagers ?? [];
        let user: User|null;

        switch(args[0]?.toLowerCase()) {
            case 'add':
            case 'new':
                if (!args[1]) return message.reply('No user specified.');
                user = await parseUser(args[1]);
                if (!user) return message.reply('I can\'t find that user.');

                if (admins.indexOf(user._id) > -1) return message.reply('This user is already added as bot admin.');

                admins.push(user._id);
                await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { botManagers: admins } });

                message.reply(`✅ Added \`@${user.username}\` to bot admins.`);
            break;
            case 'remove':
            case 'delete':
            case 'rm':
            case 'del':
                if (!args[1]) return message.reply('No user specified.');
                user = await parseUser(args[1]);
                if (!user) return message.reply('I can\'t find that user.');

                if (admins.indexOf(user._id) == -1) return message.reply('This user is not added as bot admin.');

                admins = admins.filter(a => a != user?._id);
                await client.db.get('servers').update({ id: message.channel?.server_id }, { $set: { botManagers: admins } });

                message.reply(`✅ Removed \`@${user.username}\` from bot admins.`);
            break;
            case 'list':
            case 'ls':
            case 'show':
                message.reply(`# Bot admins\n`
                            + `Users with **ManageServer** permission can add or remove admins.\n\n`
                            + `${admins.map(a => `* <@${a}>`).join('\n')}\n\n`
                            + `${admins.length} user${admins.length == 1 ? '' : 's'}.`)
                    ?.catch(e => message.reply(e));
            break;
            default:
                message.reply(`Available subcommands: ${SYNTAX}`);
        }
    }
} as Command;
