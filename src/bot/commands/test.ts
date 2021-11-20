import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'epic test command',
    run: (message: Message, args: string[]) => {
        message.reply('I am here');
    }
} as Command;
