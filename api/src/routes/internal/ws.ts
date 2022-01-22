/**
 * Provides a WebSocket the bot can connect to.
 * (IPC on crack)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { logger } from "../..";
import server from '../../server';
if (!process.env.BOT_API_TOKEN) {
    logger.error(`$BOT_API_TOKEN is not set. This token is `
        + `required for the bot to communicate with the API.`);
    process.exit(1);
}

const { BOT_API_TOKEN } = process.env;
const wsServer = new WebSocketServer({ noServer: true });
const sockets: WebSocket[] = [];

wsServer.on('connection', (sock) => {
    sockets.push(sock);

    sock.once('close', () => {
        logger.debug('WS closed');
        const i = sockets.findIndex(s => s == sock);
        sockets.splice(i, 1);
    });

    sock.on('message', (msg) => {
        logger.debug(`[WS] [<] ${msg.toString()}`);
        sock.send(JSON.stringify({ "h": JSON.parse(msg.toString()) }));
    });
});

server.on('upgrade', (req, socket, head) => {
    logger.debug(`WS Upgrade ${req.url}`);

    switch(req.url) {
        case '/internal/ws':
            if (req.headers['authorization'] !== BOT_API_TOKEN) {
                logger.debug('WS unauthorized');
                head.write(JSON.stringify({ error: 'Not authenticated' }, null, 4));
                socket.end();
            } else {
                wsServer.handleUpgrade(req, socket, head, (sock) => {
                    wsServer.emit('connection', sock, req);
                });
            }
            break;
        default:
            head.write(JSON.stringify({ error: 'Cannot open WebSocket on this endpoint' }, null, 4));
            socket.end();
    }
});
