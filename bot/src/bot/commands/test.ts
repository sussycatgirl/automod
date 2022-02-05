import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'Test command',
    category: 'misc',
    run: (message: MessageCommandContext, args: string[]) => {
        setTimeout(() => message.reply('Beep boop.'), 1000);
    }
} as Command;
