import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { inspect } from 'util';
import { client } from "../..";

export default {
    name: 'eval',
    aliases: [ 'e' ],
    description: 'Evaluate JS code',
    restrict: 'BOTOWNER',
    removeEmptyArgs: false,
    run: async (message: Message, args: string[]) => {
        let cmd = `let { client } = require("../..");`
                + `let axios = require("axios").default;`
                + `let crypto = require("crypto");`
                + args.join(' ');

        let m = await message.channel?.sendMessage(`Executing...`);

        try {
            let e = eval(cmd);

            if (e instanceof Promise) {
                await m?.edit({ content: `## **Promise**<pending>` });
                e.then((res) => {
                    m?.edit({
                        content: `## **Promise**<resolved>\n\`\`\`js\n${render(res)}\n\`\`\``
                    });
                })
                .catch((res) => {
                    m?.edit({
                        content: `## **Promise**<rejected>\n\`\`\`js\n${render(res)}\n\`\`\``
                    });
                });
            } else {
                message.channel?.sendMessage(`\`\`\`js\n${render(e)}\n\`\`\``);
            }
        } catch(e) {
            m?.edit({ content: `## Execution failed\n\`\`\`js\n${render(e)}\n\`\`\`` });
        }
    }
} as Command;

function removeSecrets(input: string): string {
    if (process.env['DB_PASS']) input = input.replace(new RegExp(process.env['DB_PASS']!, 'gi'), '[Secret redacted]');
    if (process.env['DB_URL']) input = input.replace(new RegExp(process.env['DB_URL']!, 'gi'), '[Secret redacted]');
    input = input.replace(new RegExp(process.env['BOT_TOKEN']!, 'gi'), '[Secret redacted]');
        
    return input;
}

function render(input: any): string {
    return removeSecrets(inspect(input)).substr(0, 1960);
}
