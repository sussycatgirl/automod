import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";
import { hasPerm } from "../util";

export default {
    name: 'debug',
    aliases: null,
    description: 'give info helpful for development and debugging',
    serverOnly: false,
    run: (message: Message, args: string[]) => {
        message.reply(`Server ID: ${message.channel?.server_id || 'None'}\n`
                    + `Channel ID: ${message.channel_id}\n`
                    + `User ID: ${message.author_id}`);

        console.log(hasPerm(message.member!, 'BanMembers'));
    }
} as Command;
