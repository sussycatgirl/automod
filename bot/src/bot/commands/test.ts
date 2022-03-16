import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'Test command',
    category: 'misc',
    run: (message: MessageCommandContext, args: string[]) => {
        message.reply('Beep boop.');
    }
} as Command;
