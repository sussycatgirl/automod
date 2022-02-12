import prom from 'prom-client';
import http from 'http';
import logger from '../logger';
import { client } from '../..';

const PORT = Number(process.env.BOT_METRICS_PORT);

prom.collectDefaultMetrics({ prefix: 'automod_' });

const metrics = {
    commands: new prom.Counter({ name: 'commands_executed', help: 'Command usage stats', labelNames: [ 'command' ] }),
    servers: new prom.Gauge({ name: 'server_count', help: 'Amount of servers the bot is in' }),
    wsPing: new prom.Gauge({ name: 'ws_ping', help: 'WebSocket ping as returned by revolt.js' }),
    msgPing: new prom.Gauge({ name: 'msg_ping', help: 'Amount of time it takes for the bot to send a message' }),
}

if (!isNaN(PORT)) {
    logger.info(`Enabling Prometheus metrics on :${PORT}`);

    const server = new http.Server();

    server.on('request', async (req, res) => {
        if (req.url == '/metrics') {
            res.write(await prom.register.metrics());
            res.end();
        } else {
            res.statusCode = 404;
            res.write('404 not found');
            res.end();
        }
    });

    const setServerCount = () => metrics.servers.set(client.servers.size);

    client.once('ready', setServerCount);
    client.on('server/update', setServerCount);
    client.on('server/delete', setServerCount);

    const measureLatency = async () => {
        const wsPing = client.websocket.ping;
        if (wsPing != undefined) metrics.wsPing.set(wsPing);
    }

    client.once('ready', () => {
        measureLatency();
        setInterval(measureLatency, 10000);

        if (process.env.BOT_METRICS_MSG_PING_CHANNEL) {
            logger.info('BOT_METRICS_MSG_PING_CHANNEL is set, enabling message latency measuring');

            const getMsgPing = async () => {
                const channel = client.channels.get(process.env.BOT_METRICS_MSG_PING_CHANNEL!);
                try {
                    const now = Date.now();
                    const msg = await channel?.sendMessage('Ping?');
                    if (!msg) return;

                    const delay = Date.now() - now;
                    metrics.msgPing.set(delay);
                    await msg.edit({ content: `Pong! ${delay}ms` });
                } catch(e) { console.error(e) }
            }

            getMsgPing();
            setInterval(getMsgPing, 30000);
        }
    });

    server.listen(PORT, () => logger.done(`Prometheus metrics ready`));
}

export { metrics };
