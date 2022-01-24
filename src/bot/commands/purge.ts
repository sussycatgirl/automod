import Command from "../../struct/Command";
import { Message } from "revolt.js/dist/maps/Messages";
import { decodeTime } from 'ulid';
import { isModerator, parseUser } from "../util";
import MessageCommandContext from "../../struct/MessageCommandContext";

const SYNTAX = '/purge [SELECTOR] [@user?[m @user?[, ...]]]; where SELECTOR: [number] || [messageID]-[messageID]';
const MAX_PURGE_AMOUNT = 100;

export default {
    name: 'purge',
    aliases: [ 'clear' ],
    description: 'Mass delete messages',
    syntax: SYNTAX,
    category: 'moderation',
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            if (!message.member || !await isModerator(message)) return message.reply('🔒 Access denied');

            let messages: Array<Message> = [];
            // X amount of messages from bottom
            if (/^[0-9]+$/g.test(args[0])) {
                let amount = Number(args[0]);
                if (isNaN(amount)) return message.reply('Invalid number');
                if (amount > MAX_PURGE_AMOUNT) return message.reply(`Message count exceeds the limit of ${MAX_PURGE_AMOUNT}.`);

                messages = await message.channel!.fetchMessages({
                    limit: amount
                });
            }
            // delete messages between [id] and [id]
            // [0-9A-HJ-KM-NP-TV-Z]{26} -> matches ULIDs
            else if (/^[0-9A-HJ-KM-NP-TV-Z]{26}-[0-9A-HJ-KM-NP-TV-Z]{26}$/g.test(args[0])) {
                let [id1, id2] = args[0].split('-');

                let [msg1, msg2] = await Promise.all([
                    message.channel!.fetchMessage(id1),
                    message.channel!.fetchMessage(id2),
                ]);

                // Make sure the msg1 and msg2 are in the correct order
                if (decodeTime(msg1._id) < decodeTime(msg2._id)) {
                    [msg1, msg2] = [msg2, msg1];
                }

                messages = await message.channel!.fetchMessages({
                    before: id2,
                    after: id1,
                    limit: MAX_PURGE_AMOUNT,
                    sort: 'Latest',
                });

                if (!messages.find(m => m._id == msg1._id)) messages = [ msg1, ...messages ];
                if (!messages.find(m => m._id == msg2._id)) messages = [ ...messages, msg2 ];

                // Discard messages that are not in the selected range,
                // because Revolt returns more messages than expected for some reason
                messages = messages.filter(
                    m => decodeTime(m._id) <= decodeTime(id2) &&
                         decodeTime(m._id) >= decodeTime(id1)
                );
            }
            // allow single messages too, because why not?
            else if (/^[0-9A-HJ-KM-NP-TV-Z]{26}$/g.test(args[0])) {
                messages = [ await message.channel!.fetchMessage(args[0]) ];
            } else {
                return message.reply(`I can't parse that message range.\nSyntax: \`${SYNTAX}\``);
            }

            if (args[1]) {
                let p = args[1].split(',').map(u => parseUser(u));
                let users = await Promise.all(p);

                if (users.filter(u => !u).length > 0)
                    return message.reply('At least one of the supplied users could not be found.');

                messages = messages.filter(m => users.find(u => u?._id == m.author_id));
            }

            let m = await (message.channel?.sendMessage(`Deleting ${messages.length} messages...`)?.catch(console.error));
            let res = await Promise.allSettled(messages.map(m => m.delete()));

            let failures = res.filter(r => r.status == 'rejected').length;

            await m?.edit({ content: `Deleted ${messages.length} messages.`
                + `${failures > 0 ? `\n${failures} message${failures == 1 ? '' : 's'} failed to delete.` : ''}` })
                .catch(console.error);
        } catch(e) {
            message.channel?.sendMessage(`An error has occurred: ${e}`);
        }
    }
} as Command;
