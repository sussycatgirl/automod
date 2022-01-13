import Command from "../../struct/Command";
import { isModerator, NO_MANAGER_MSG, parseUserOrId, storeInfraction } from "../util";
import Infraction from "../../struct/antispam/Infraction";
import { ulid } from "ulid";
import InfractionType from "../../struct/antispam/InfractionType";
import { fetchUsername, logModAction } from "../modules/mod_logs";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'warn',
    aliases: null,
    removeEmptyArgs: false,
    description: 'add an infraction to an user\'s record',
    category: 'moderation',
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!await isModerator(message)) return message.reply(NO_MANAGER_MSG);
        let user = await parseUserOrId(args.shift() ?? '');
        if (!user) return message.reply('I can\'t find that user.');
        if ((user as any)?.bot != null) return message.reply('You cannot warn bots.');

        let reason: string = args.join(' ')
            ?.replace(new RegExp('`', 'g'), '\'')
            ?.replace(new RegExp('\n', 'g'), ' ')
            || 'No reason provided.';
        if (reason.length > 200) return message.reply('Warn reason may not be longer than 200 characters.');

        let infraction = {
            _id: ulid(),
            createdBy: message.author_id,
            user: user._id,
            reason: reason,
            server: message.serverContext._id,
            type: InfractionType.Manual,
            date: Date.now(),
        } as Infraction;

        let { userWarnCount } = await storeInfraction(infraction);

        await Promise.all([
            message.reply(`### User warned`
                + `${message.serverContext._id != message.channel?.server_id ? ` in **${message.serverContext.name}**` : ''}.\n`
                          + `This is ${userWarnCount == 1 ? '**the first warn**' : `warn number **${userWarnCount}**`}`
                            + ` for ${await fetchUsername(user._id)}.\n`
                          + `**Infraction ID:** \`${infraction._id}\`\n`
                          + `**Reason:** \`${infraction.reason}\``),
            logModAction('warn', message.serverContext, message.member!, user._id, reason, infraction, `This is warn number ${userWarnCount} for this user.`),
        ]);
    }
} as Command;
