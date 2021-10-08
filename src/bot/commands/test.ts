import Command from "../../struct/Command";
import { client } from "../..";
import { Message } from "revolt.js/dist/maps/Messages";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'epic test command',
    serverOnly: false,
    run: (message: Message, args: string[]) => {
        message.reply('I am here');
    }
} as Command;