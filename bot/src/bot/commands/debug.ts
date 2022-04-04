import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'debug',
    aliases: null,
    description: 'Gives info helpful for development and debugging',
    category: CommandCategory.Misc,
    run: (message: MessageCommandContext, args: string[]) => {
        message.reply(`Server ID: ${message.channel?.server_id || 'None'}\n`
                    + `Server context: ${message.serverContext._id} `
                        + `(${message.serverContext._id == message.channel?.server_id ? 'This server' : message.serverContext.name})\n`
                    + `Channel ID: ${message.channel_id}\n`
                    + `User ID: ${message.author_id}`);
    }
} as SimpleCommand;
