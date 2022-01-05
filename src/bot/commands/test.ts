import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'Test command',
    category: 'misc',
    run: (message: Message, args: string[]) => {
        message.reply('Beep boop.');
    }
} as Command;
