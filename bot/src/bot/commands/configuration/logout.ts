import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { DEFAULT_PREFIX } from "../../modules/command_handler";

export default {
    name: 'logout',
    aliases: null,
    description: 'Log out of sessions created with /login',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            const code = args.shift();
            if (!code) {
                return message.reply(`### No code provided.\n`
                    + `You can invalidate a session by using \`${DEFAULT_PREFIX}logout [Code]\`, `
                    + `or log out everywhere with \`${DEFAULT_PREFIX}logout ALL\``);
            }

            if (code.toLowerCase() == 'all') {
                const [resA, resB] = await Promise.all([
                    dbs.PENDING_LOGINS.update({ user: message.authorId, invalid: false }, { $set: { invalid: true } }),
                    dbs.SESSIONS.update({ user: message.authorId, invalid: false }, { $set: { invalid: true } }),
                ]);

                if (resA.nModified == 0 && resB.nModified == 0) return message.reply('There are no sessions to invalidate.');

                message.reply(`Successfully invalidated ${resA.nModified} codes and ${resB.nModified} sessions.`);
            } else {
                const loginAttempt = await dbs.PENDING_LOGINS.findOne({
                    code: code.toUpperCase(),
                    user: message.authorId,
                });

                if (!loginAttempt || loginAttempt.invalid) {
                    return message.reply('That code doesn\'t seem to exist.');
                }

                await dbs.PENDING_LOGINS.update({ _id: loginAttempt._id }, { $set: { invalid: true } });

                if (loginAttempt.exchanged) {
                    const session = await dbs.SESSIONS.findOne({ nonce: loginAttempt.nonce });
                    if (session) {
                        await dbs.SESSIONS.update({ _id: session._id }, { $set: { invalid: true } });
                        return message.reply(`Successfully invalidated code and terminated associated session.`);
                    }
                }

                message.reply(`Successfully invalidated code.`);
            }
        } catch(e) {
            console.error(e);
            message.reply(`An error occurred: ${e}`);
        }
    }
} as SimpleCommand;
