import { logger } from "..";
import { client } from "./client";

client.on('message', message => {
    logger.debug(`[M] Revolt: ${message.content}`);
});
