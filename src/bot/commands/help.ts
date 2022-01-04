import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";

export default {
    name: 'help',
    aliases: null,
    description: 'help command i guess',
    run: (message: Message, args: string[]) => {
        message.reply(`command list can be found here kthxbay https://github.com/janderedev/revolt-automod/wiki/Bot-usage`);
    }
} as Command;
