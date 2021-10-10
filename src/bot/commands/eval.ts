import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";
import { inspect } from 'util';

export default {
    name: 'eval',
    aliases: [ 'e' ],
    description: 'Evaluate JS code',
    restrict: 'BOTOWNER',
    removeEmptyArgs: false,
    serverOnly: false,
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
                        content: `## **Promise**<resolved>\n\`\`\`js\n${`${inspect(res)}`.substr(0, 1960)}\n\`\`\``
                    });
                })
                .catch((res) => {
                    m?.edit({
                        content: `## **Promise**<rejected>\n\`\`\`js\n${`${inspect(res)}`.substr(0, 1960)}\n\`\`\``
                    });
                });
            } else {
                message.channel?.sendMessage(`\`\`\`js\n${inspect(e).substr(0, 1980)}\n\`\`\``);
            }
        } catch(e) {
            m?.edit({ content: `## Execution failed\n\`\`\`js\n${inspect(e).substr(0, 1960)}\n\`\`\`` });
        }
    }
} as Command;
