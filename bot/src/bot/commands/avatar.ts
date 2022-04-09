import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import axios from "axios";
import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";
import { hasPerm, isModerator, NO_MANAGER_MSG, parseUser } from "../util";

export default {
    name: 'avatar',
    aliases: [ 'pfp' ],
    description: 'Get or clear someone\'s avatar',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            const targetStr = args.shift();
            if (!targetStr) return message.reply('No target user specified.');
            const targetUser = await parseUser(targetStr);
            if (!targetUser) return message.reply('Couldn\'t find the specified user.');
            const target = await message.channel?.server?.fetchMember(targetUser);
            if (!target) return message.reply('The target is not part of this server.');

            if (args[0]?.toLowerCase() == 'reset'
             || args[0]?.toLowerCase() == 'clear') {
                // Clear server avatar
                if (!message.member) return;
                if (!hasPerm(message.member, 'RemoveAvatars')
                 && !await isModerator(message)) return message.reply(NO_MANAGER_MSG);

                if (!target.avatar) {
                    await message.reply(`\`@${targetUser.username}\` does not currently have an avatar set for this server.`);
                } else {
                    await clearAvatar(target);
                    await message.reply(`\`@${targetUser.username}\`'s server avatar has been cleared.`);
                }
            } else {
                // Print server and global avatar

                await message.reply(
                    `### \`@${targetUser.username}\`'s avatar\n` +
                    (targetUser.avatar ? `[\\[Global\\]](<${targetUser.generateAvatarURL()}>)` : '[No global avatar]') +
                    ' | ' +
                    (target.avatar ? `[\\[Server\\]](<${target.generateAvatarURL()}>)` : '[No server avatar]')
                );
            }
        } catch(e) {
            console.error('' + e);
            message.reply('Something went wrong: ' + e);
        }
    }
} as SimpleCommand;

async function clearAvatar(member: Member) {
    await axios.patch(
        `${member.client.apiURL}/servers/${member.server!._id}/members/${member._id.user}`,
        {
            remove: "Avatar",
        },
        {
            headers: {
                'x-bot-token': process.env['BOT_TOKEN']!
            }
        }
    );
}
