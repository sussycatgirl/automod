import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";

export default {
    name: 'healthcheck',
    aliases: null,
    description: 'Health check',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        const msg = await message.reply('Health check success: ' + args.join(' '));
    }
} as SimpleCommand;
