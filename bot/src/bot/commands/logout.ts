import { FindOneResult, FindResult } from "monk";
import { client } from "../..";
import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";
import PendingLogin from "../../struct/PendingLogin";
import { DEFAULT_PREFIX } from "../modules/command_handler";

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
                    client.db.get('pending_logins').update({ user: message.author_id, invalid: false }, { $set: { invalid: true } }),
                    client.db.get('sessions').update({ user: message.author_id, invalid: false }, { $set: { invalid: true } }),
                ]);

                if (resA.nModified == 0 && resB.nModified == 0) return message.reply('There are no sessions to invalidate.');

                message.reply(`Successfully invalidated ${resA.nModified} codes and ${resB.nModified} sessions.`);
            } else {
                const loginAttempt: FindOneResult<PendingLogin> = await client.db.get('pending_logins')
                    .findOne({
                        code: code.toUpperCase(),
                        user: message.author_id,
                    });

                if (!loginAttempt || loginAttempt.invalid) {
                    return message.reply('That code doesn\'t seem to exist.');
                }

                await client.db.get('pending_logins').update({ _id: loginAttempt._id }, { $set: { invalid: true } });

                if (loginAttempt.exchanged) {
                    const session: FindOneResult<any> = await client.db.get('sessions').findOne({ nonce: loginAttempt.nonce });
                    if (session) {
                        await client.db.get('sessions').update({ _id: session._id }, { $set: { invalid: true } });
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
