import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { isModerator, NO_MANAGER_MSG, parseUser, storeInfraction } from "../util";
import Infraction from "../../struct/antispam/Infraction";
import { ulid } from "ulid";
import InfractionType from "../../struct/antispam/InfractionType";
import { logModAction } from "../modules/mod_logs";

export default {
    name: 'warn',
    aliases: null,
    removeEmptyArgs: false,
    description: 'add an infraction to an user\'s record',
    run: async (message: Message, args: string[]) => {
        if (!await isModerator(message.member!)) return message.reply(NO_MANAGER_MSG);
        let user = await parseUser(args.shift() ?? '');
        if (!user) return message.reply('I can\'t find that user.');
        if (user.bot != null) return message.reply('You cannot warn bots.');

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
            server: message.channel?.server_id!,
            type: InfractionType.Manual,
            date: Date.now(),
        } as Infraction;

        let { userWarnCount } = await storeInfraction(infraction);

        await Promise.all([
            message.reply(`## User warned.\n`
                          + `This is ${userWarnCount == 1 ? '**the first warn**' : `warn number **${userWarnCount}**`}`
                            + ` for ${user.username ?? 'this user'}.\n`
                          + `**Infraction ID:** \`${infraction._id}\`\n`
                          + `**Reason:** \`${infraction.reason}\``),
            logModAction('warn', message.member!, user, reason, `This is warn number **${userWarnCount}** for this user.`),
        ]);
    }
} as Command;
