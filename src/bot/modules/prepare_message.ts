import { Message } from "revolt.js/dist/maps/Messages";
import logger from "../logger";

// We modify the way `reply()` works to make sure we
// don't crash if the original message was deleted.

export function prepareMessage(message: Message) {
        message.reply = (...args: Parameters<typeof Message.prototype.reply>) => {
        return new Promise<Message>((resolve, reject) => {
            message.channel?.sendMessage({
                content: typeof args[0] == 'string' ? args[0] : args[0].content,
                replies: [ { id: message._id, mention: args[1] ?? true } ],
            })
                ?.then(m => resolve(m))
                .catch(e => {
                    if (e?.response?.status == 404) {
                        logger.warn("Replying to message gave 404, trying again without reply");
                        if (!message.channel) return reject("Channel does not exist");
                        message.channel?.sendMessage(typeof args[0] == 'string' ? { content: args[0] } : args[0])
                            .then(resolve)
                            .catch(reject);
                    } else reject(e);
                });
        });
    }
}
