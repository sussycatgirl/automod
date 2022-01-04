import { ulid } from "ulid";
import { client } from "../../index";
import Infraction from "../../struct/antispam/Infraction";
import InfractionType from "../../struct/antispam/InfractionType";
import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";
import TempBan from "../../struct/TempBan";
import { fetchUsername, logModAction } from "../modules/mod_logs";
import { storeTempBan } from "../modules/tempbans";
import { isModerator, NO_MANAGER_MSG, parseUser, storeInfraction } from "../util";
import Day from 'dayjs';
import RelativeTime from 'dayjs/plugin/relativeTime';

Day.extend(RelativeTime);

export default {
    name: 'ban',
    aliases: null,
    description: 'Ban a member from the server',
    syntax: '/ban @username [10m?] [reason?]',
    removeEmptyArgs: true,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!await isModerator(message.member!, message.serverContext))
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

        let banDuration = 0;
        let durationStr = args.shift();
        if (durationStr && /([0-9]{1,3}[smhdwy])+/g.test(durationStr)) {
            let pieces = durationStr.match(/([0-9]{1,3}[smhdwy])/g) ?? [];

            // Being able to specify the same letter multiple times
            // (e.g. 1s1s) and having their values stack is a feature
            for (const piece of pieces) {
                let [ num, letter ] = [ Number(piece.slice(0, piece.length - 1)), piece.slice(piece.length - 1) ];
                let multiplier = 0;

                switch(letter) {
                    case 's': multiplier = 1000; break;
                    case 'm': multiplier = 1000 * 60; break;
                    case 'h': multiplier = 1000 * 60 * 60; break;
                    case 'd': multiplier = 1000 * 60 * 60 * 24; break;
                    case 'w': multiplier = 1000 * 60 * 60 * 24 * 7; break;
                    case 'y': multiplier = 1000 * 60 * 60 * 24 * 365; break;
                }

                banDuration += num * multiplier;
            }
        } else if (durationStr) args.splice(0, 0, durationStr);

        let reason = args.join(' ') || 'No reason provided';

        if (banDuration == 0) {
            let infId = ulid();
            let infraction: Infraction = {
                _id: infId,
                createdBy: message.author_id,
                date: Date.now(),
                reason: reason,
                server: message.serverContext._id,
                type: InfractionType.Manual,
                user: targetUser._id,
                actionType: 'ban',
            }
            let { userWarnCount } = await storeInfraction(infraction);

            message.serverContext.banUser(targetUser._id, {
                reason: reason + ` (by ${await fetchUsername(message.author_id)} ${message.author_id})`
            })
            .catch(e => message.reply(`Failed to ban user: \`${e}\``));

            await Promise.all([
                message.reply(`### @${targetUser.username} has been banned.\n`
                        + `Infraction ID: \`${infId}\` (**#${userWarnCount}** for this user)`),
                logModAction('ban', message.serverContext, message.member!, targetUser._id, reason, infraction, `Ban duration: **Permanent**`),
            ]);
        } else {
            let banUntil = Date.now() + banDuration;
            let infId = ulid();
            let infraction: Infraction = {
                _id: infId,
                createdBy: message.author_id,
                date: Date.now(),
                reason: reason + ` (${durationStr})`,
                server: message.serverContext._id,
                type: InfractionType.Manual,
                user: targetUser._id,
                actionType: 'ban',
            }
            let { userWarnCount } = await storeInfraction(infraction);

            message.serverContext.banUser(targetUser._id, {
                reason: reason + ` (by ${await fetchUsername(message.author_id)} ${message.author_id}) (${durationStr})`
            })
            .catch(e => message.reply(`Failed to ban user: \`${e}\``));

            await storeTempBan({
                id: infId,
                bannedUser: targetUser._id,
                server: message.serverContext._id,
                until: banUntil,
            } as TempBan);

            await Promise.all([
                message.reply(`### ${targetUser.username} has been temporarily banned.\n`
                        + `Infraction ID: \`${infId}\` (**#${userWarnCount}** for this user)`),
                logModAction('ban', message.serverContext, message.member!, targetUser._id, reason, infraction, `Ban duration: **${Day(banUntil).fromNow(true)}**`),
            ]);
        }
    }
} as Command;
