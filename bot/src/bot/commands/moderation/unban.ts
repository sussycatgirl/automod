import { dbs } from "../../../";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { removeTempBan } from "../../modules/tempbans";
import { isModerator, NO_MANAGER_MSG, parseUser, ULID_REGEX, USER_MENTION_REGEX } from "../../util";

export default {
    name: 'unban',
    aliases: [ 'pardon' ],
    description: 'Unbans a user',
    syntax: '/unban [@user or ID]',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!await isModerator(message)) return message.reply(NO_MANAGER_MSG);
        if (!message.serverContext.havePermission('BanMembers')) {
            return await message.reply(`Sorry, I do not have \`BanMembers\` permission.`);
        }

        let checkTempBans = async (id: string): Promise<number> => {
            let tempbans = await dbs.TEMPBANS.find({ bannedUser: id, server: message.serverContext.id });
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
                id = (await parseUser(target))?.id;
            } catch(e) {
                if (USER_MENTION_REGEX.test(target)) {
                    id = target
                        .replace('<@', '')
                        .replace('>', '');
                } else if (ULID_REGEX.test(target)) {
                    id = target;
                } else {
                    let ban = bans.find(b => b.user?.username.toLowerCase() == target.toLowerCase());
                    if (ban) id = ban.id.user;
                }
            }

            if (!id) {
                let tempnum = await checkTempBans(target);
                if (tempnum > 0) {
                    return msg.edit({ content: 'The user could not be found, but leftover database entries have been cleaned up.' });
                } else return msg.edit({ content: 'The user could not be found.' });
            }

            let ban = bans.find(b => b.id.user == id);

            if (!ban) {
                let tempnum = await checkTempBans(id);
                if (tempnum > 0) {
                    return msg.edit({ content: 'This user is not banned, but leftover database entries have been cleaned up.' });
                } else return msg.edit({ content: 'This user is not banned.' });
            }

            await Promise.all([
                msg.edit({ content: `User found: @${ban.user?.username ?? ban.id.user}, unbanning...` }),
                message.serverContext.unbanUser(id),
                checkTempBans(id),
            ]);

            await msg.edit({ content: `@${ban.user?.username ?? ban.id.user} has been unbanned.` });
        } catch(e) { console.error(e) }
    }
} as SimpleCommand;
