import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import { ulid } from "ulid";
import { client } from "../..";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";
import { logModAction } from "../modules/mod_logs";
import { isModerator, NO_MANAGER_MSG, parseUser, storeInfraction } from "../util";

export default {
    name: 'kick',
    aliases: [ 'yeet', 'eject', 'vent' ],
    description: 'Eject a member from the server',
    syntax: '/kick @username [reason?]',
    removeEmptyArgs: true,
    category: 'moderation',
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!await isModerator(message))
            return message.reply(NO_MANAGER_MSG);
        
        if (args.length == 0)
            return message.reply(`You need to provide a target user!`);
        
        let targetUser = await parseUser(args.shift()!);
        if (!targetUser) return message.reply('Sorry, I can\'t find that user.');

        if (targetUser._id == message.author_id) {
            return message.reply('nah');
        }

        if (targetUser._id == client.user!._id) {
            return message.reply('lol no');
        }

        let reason = args.join(' ') || 'No reason provided';

        let targetMember: Member;
        try {
            targetMember = await message.serverContext.fetchMember(targetUser._id);
        } catch(e) {
            return message.reply(`Failed to fetch member: \`${e}\``);
        }

        let infId = ulid();
        let infraction: Infraction = {
            _id: infId,
            createdBy: message.author_id,
            date: Date.now(),
            reason: reason,
            server: message.serverContext._id,
            type: InfractionType.Manual,
            user: targetUser._id,
            actionType: 'kick',
        }
        let { userWarnCount } = await storeInfraction(infraction);

        try {
            await targetMember.kick();
        } catch(e) {
            return message.reply(`Failed to kick user: \`${e}\``);
        }

        await Promise.all([
            message.reply(`### @${targetUser.username} has been ${Math.random() > 0.8 ? 'ejected' : 'kicked'}.\n`
                    + `Infraction ID: \`${infId}\` (**#${userWarnCount}** for this user)`),
            logModAction('kick', message.serverContext, message.member!, targetUser._id, reason, infraction),
        ]);
    }
} as Command;
