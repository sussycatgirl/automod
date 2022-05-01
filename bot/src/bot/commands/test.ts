import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'test',
    aliases: [ 'testalias' ],
    description: 'Test command',
    category: CommandCategory.Misc,
    run: (message: MessageCommandContext, args: string[]) => {
        message.reply({
            content: 'Beep boop.',
            embeds: [
                {
                    colour: "#ff0000",
                    description: "embed description",
                    title: "embed title",
                    url: "https://amogus.org",
                    icon_url: "https://amogus.org/amogus.png"
                }
            ],
        });
    }
} as SimpleCommand;
