/**
 * Provides a WebSocket the bot can connect to.
 * (IPC on crack)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from "../..";
import server from '../../server';

if (!process.env.BOT_API_TOKEN) {
    logger.error(`$BOT_API_TOKEN is not set. This token is `
        + `required for the bot to communicate with the API.`);
    process.exit(1);
}

const { BOT_API_TOKEN } = process.env;
const wsServer = new WebSocketServer({ noServer: true });
const botWS = new EventEmitter();
const sockets: WebSocket[] = [];

wsServer.on('connection', (sock) => {
    sockets.push(sock);

    sock.once('close', () => {
        logger.debug('WS closed');
        const i = sockets.findIndex(s => s == sock);
        sockets.splice(i, 1);
    });

    sock.on('message', (msg) => {
        const jsonBody = JSON.parse(msg.toString());
        logger.debug(`[WS] [<] ${msg.toString()}`);
        botWS.emit('message', jsonBody);
        if (jsonBody.data && jsonBody.type) {
            botWS.emit(jsonBody.type, jsonBody.data);
        }
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

function sendBotWS(msg: { [key: string]: any }) {
    const socks = sockets.filter(sock => sock.readyState == sock.OPEN);
    logger.debug(`[WS] [>] [${socks.length}] ${JSON.stringify(msg)}`);
    socks.forEach(sock => sock.send(JSON.stringify(msg)));
}

type botReqRes = { success: false, error: string, statusCode?: number } | { success: true, [key: string]: any }
function botReq(type: string, data?: { [key: string]: any }): Promise<botReqRes> {
    return new Promise((resolve, reject) => {
        const nonce = `${Date.now()}.${Math.round(Math.random() * 10000000)}`;
        if (sockets.length == 0) return resolve({ success: false, error: 'Unable to communicate with bot' });
        sendBotWS({ nonce, type, data });
        botWS.once(`response:${nonce}`, (data: string|Object) => {
            try {
                const d = typeof data == 'string' ? JSON.parse(data || '{}') : data;
                if (d.success == undefined) d.success = true;
                if (d.success == false && !d.error) d.error = 'Unknown error';
                resolve(d);
            } catch(e) { reject(e) }
        });
    });
}

//setInterval(() => botReq('test', { "sus": true }), 1000);

export { botWS, sendBotWS, botReq }
