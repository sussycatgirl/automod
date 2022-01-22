/**
 * This handles communication with the API server.
 */

import ws from "ws";
import logger from "../logger";
import { EventEmitter } from "events";

const wsEvents = new EventEmitter();
const { API_WS_URL, API_WS_TOKEN } = process.env;
const wsQueue: { [key: string]: string }[] = [];
let client: ws|undefined = undefined;

if (!API_WS_URL || !API_WS_TOKEN)
    logger.info("$API_WS_URL or $API_WS_TOKEN not found.");
else {
    logger.info(`$API_WS_URL and $API_WS_TOKEN set; Connecting to ${API_WS_URL}`);
    connect();
}

function connect() {
    if (client && client.readyState == ws.OPEN) client.close();
    client = new ws(API_WS_URL!, { headers: { authorization: API_WS_TOKEN! } });

    client.once("open", () => {
        logger.debug("WS connected");
        if (wsQueue.length > 0) {
            logger.debug(`Attempting to send ${wsQueue.length} queued WS messages`);

            while (wsQueue.length > 0) {
                if (client?.readyState != ws.OPEN) break;
                const data = JSON.stringify(wsQueue.shift());
                logger.debug(`[WS] [FROM QUEUE] [>] ${data}`);
                client.send(data);
            }
        }
    });

    client.once("close", () => {
        client = undefined;
        logger.warn(`WS closed, reconnecting in 3 seconds`);
        setTimeout(connect, 3000);
    });

    client.once('error', (err) => {
        client = undefined;
        logger.warn(`WS: ${err}`);
    });

    client.on('message', (msg) => {
        logger.debug(`[WS] [<] ${msg.toString('utf8')}`);
        try {
            wsEvents.emit('message', JSON.parse(msg.toString('utf8')));
        } catch(e) { console.error(e) }
    });
}

function wsSend(data: { [key: string]: string }) {
    if (client && client.readyState == client.OPEN) {
        logger.debug(`[WS] [>] ${JSON.stringify(data)}`);
        client.send(JSON.stringify(data));
    } else {
        logger.debug(`[WS] [QUEUED] [>] ${JSON.stringify(data)}`);
        wsQueue.push(data);
    }
}

setInterval(() => wsSend({ "among": "us" }), 1000);

export { wsEvents, wsSend }
