import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";
import { exec } from 'child_process';
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'shell',
    aliases: [ 'exec', 'sh' ],
    description: 'Run code in a shell',
    restrict: 'BOTOWNER',
    removeEmptyArgs: false,
    category: 'owner',
    run: async (message: MessageCommandContext, args: string[]) => {
        let cmd = args.join(' ');

        let m = await message.channel?.sendMessage(`Executing...`);

        try {
            let editMsg = () => {
                if (str != '' && str != oldStr) {
                    if (str.length > 2000) {
                        str = str.substr(str.length - 2000);
                    }

                    m?.edit({ content: str })
                        .catch(e => console.warn('Failed to edit message'));
                }
            }

            let str = '', oldStr = '';
            let e = exec(cmd);
            let i = setInterval(editMsg, 1000);

            e.stdout?.on('data', m => {
                str += m;
            });

            e.on('exit', (code) => {
                clearInterval(i);
                str += `\n\n**Exit code:** ${code}`;
                editMsg();
            });
        } catch(e) {
            message.channel?.sendMessage(`${e}`);
        }
    }
} as Command;
