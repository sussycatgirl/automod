import { FindOneResult } from "monk";
import { client, dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import PendingLogin from "../../../struct/PendingLogin";
import logger from "../../logger";
import { DEFAULT_PREFIX } from "../../modules/command_handler";

export default {
    name: 'login',
    aliases: null,
    description: 'Log into the web dashboard',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            const code = args.shift();
            if (!code) {
                return message.reply(`If you're trying to log in, you can access the dashboard `
                    + `[here](${process.env.WEB_UI_URL || 'https://automod.janderedev.xyz'}).\n\n`
                    + `If you already have a code, you can use \`${DEFAULT_PREFIX}login [Code]\`.`);
            }

            const login: FindOneResult<PendingLogin> = await dbs.PENDING_LOGINS.findOne({
                code,
                user: message.author_id,
                confirmed: false,
                exchanged: false,
                invalid: false,
                expires: {
                    $gt: Date.now(),
                },
            });

            if (!login) return message.reply(`Unknown code. Make sure you're logged into the correct account.`);

            if (login.requirePhishingConfirmation) {
                logger.info(`Showing phishing warning to ${message.author_id}`);
                await Promise.all([
                    message.reply(
                        `# If someone told you to run this, stop!\n` +
                        `This could give an attacker access to all servers you're using AutoMod in.\n` +
                        `If someone else told you to run this command, **block them and ignore this.**\n\n` +
                        `Otherwise, if this was you trying to log in from <${process.env.WEB_UI_URL || 'https://automod.janderedev.xyz'}>, \n` +
                        `you can run this command again to continue.\n` +
                        `##### You're seeing this because this is the first time you're trying to log in. Stay safe!`
                    ),
                    dbs.PENDING_LOGINS.update({ _id: login._id }, { $set: { requirePhishingConfirmation: false } }),
                ]);
                return;
            }

            await Promise.all([
                message.reply(`Successfully logged in.\n\n` +
                    `If this wasn't you, run \`${DEFAULT_PREFIX}logout ${code}\` immediately.`),
                dbs.PENDING_LOGINS.update({ _id: login._id }, { $set: { confirmed: true } }),
            ]);
        } catch(e) {
            console.error(e);
            message.reply(`An error occurred: ${e}`);
        }
    }
} as SimpleCommand;
