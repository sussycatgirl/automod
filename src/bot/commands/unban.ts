import { FindResult } from "monk";
import { client } from "../..";
import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";
import TempBan from "../../struct/TempBan";
import { removeTempBan } from "../modules/tempbans";
import { isModerator, NO_MANAGER_MSG, parseUser, ULID_REGEX, USER_MENTION_REGEX } from "../util";

export default {
    name: 'unban',
    aliases: [ 'pardon' ],
    description: 'Unbans a user',
    syntax: '/unban [@user or ID]',
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!isModerator(message.member!, message.serverContext)) return message.reply(NO_MANAGER_MSG);

        let checkTempBans = async (id: string): Promise<number> => {
            let tempbans: FindResult<TempBan> = await client.db.get('tempbans').find({ bannedUser: id, server: message.serverContext._id });
            if (tempbans.length > 0) {
                for (const ban of tempbans) {
                    await removeTempBan(ban.id);
                }
            }
            return tempbans.length;
        }

        try {
            let [msg, bans] = await Promise.all([
                message.reply('Fetching bans...')!,
                message.serverContext.fetchBans(),
            ]);

            let target = args[0];
            let id: string|undefined = undefined;

            try {
                id = (await parseUser(target))?._id;
            } catch(e) {
                if (USER_MENTION_REGEX.test(target)) {
                    id = target
                        .replace('<@', '')
                        .replace('>', '');
                } else if (ULID_REGEX.test(target)) {
                    id = target;
                } else {
                    let user = bans.users.find(u => u.username.toLowerCase() == target.toLowerCase());
                    if (user) id = user._id;
                }
            }

            if (!id) {
                let tempnum = await checkTempBans(target);
                if (tempnum > 0) {
                    return msg.edit({ content: 'The user could not be found, but leftover database entries have been cleaned up.' });
                } else return msg.edit({ content: 'The user could not be found.' });
            }

            let bannedUser = bans.users.find(u => u._id == id);

            if (!bannedUser) {
                let tempnum = await checkTempBans(id);
                if (tempnum > 0) {
                    return msg.edit({ content: 'This user is not banned, but leftover database entries have been cleaned up.' });
                } else return msg.edit({ content: 'This user is not banned.' });
            }

            await Promise.all([
                msg.edit({ content: `User found: @${bannedUser.username}, unbanning...` }),
                message.serverContext.unbanUser(id),
                checkTempBans(id),
            ]);

            await msg.edit({ content: `@${bannedUser.username} has been unbanned.` });
        } catch(e) { console.error(e) }
    }
} as Command;
