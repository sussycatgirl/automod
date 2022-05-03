import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { client } from "../../..";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import CommandCategory from "../../../struct/commands/CommandCategory";

export default {
    name: 'ping',
    aliases: null,
    description: 'ping pong',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        let now = Date.now();
        message.reply(`Measuring...`)
            ?.catch(console.error)
            .then(msg => {
                if (msg) msg.edit({ content:  `## Ping Pong!\n`
                                    + `WS: \`${client.websocket.ping ?? '--'}ms\`\n`
                                    + `Msg: \`${Math.round(Date.now() - now) / 2}ms\`` });
        });
    }
} as SimpleCommand;
