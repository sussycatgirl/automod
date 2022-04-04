import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'Test command',
    category: CommandCategory.Misc,
    run: (message: MessageCommandContext, args: string[]) => {
        message.reply('Beep boop.');
    }
} as SimpleCommand;
