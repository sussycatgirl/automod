import { Message } from "revolt.js";
import { Server } from "revolt.js";

class MessageCommandContext extends Message {
    // The server to which the command should be applied.
    serverContext: Server;
}

export default MessageCommandContext;
