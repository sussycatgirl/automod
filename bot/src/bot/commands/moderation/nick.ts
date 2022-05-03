import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import axios from "axios";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { hasPerm, isModerator, NO_MANAGER_MSG, parseUser } from "../../util";

export default {
    name: 'nick',
    aliases: [ 'setnick' ],
    description: 'Set or clear someone\'s nickname',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            if (!message.member) return;
            if (!hasPerm(message.member, 'ManageNicknames')
             && !await isModerator(message)) return message.reply(NO_MANAGER_MSG);

            const targetStr = args.shift();
            if (!targetStr) return message.reply('No target user specified.');
            const targetUser = await parseUser(targetStr);
            if (!targetUser) return message.reply('Couldn\'t find the specified user.');
            const target = await message.channel?.server?.fetchMember(targetUser);
            if (!target) return message.reply('The target is not part of this server.');

            const newName = args.join(' ');

            if (!newName) {
                // Reset name
                await setNick(target, null);
                await message.reply(`Nickname of \`@${targetUser.username}\` has been cleared.`);
            } else {
                // Set new name
                await setNick(target, newName);
                await message.reply(`Nickname of \`@${targetUser.username}\` has been changed to `
                    + `"${newName.replace(/`/g, '\\`')}".`);
            }
        } catch(e) {
            console.error('' + e);
            message.reply('Something went wrong: ' + e);
        }
    }
} as SimpleCommand;

async function setNick(member: Member, newName: string|null) {
    await axios.patch(
        `${member.client.apiURL}/servers/${member.server!._id}/members/${member._id.user}`,
        {
            nickname: newName || undefined,
            remove: !newName ? "Nickname" : undefined,
        },
        {
            headers: {
                'x-bot-token': process.env['BOT_TOKEN']!
            }
        }
    );
}
