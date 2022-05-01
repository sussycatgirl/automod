import prom from 'prom-client';
import http from 'http';
import { BRIDGE_CONFIG, logger } from '.';

const PORT = Number(process.env.BRIDGE_METRICS_PORT);

prom.collectDefaultMetrics({ prefix: 'automod_bridge_' });

const metrics = {
    messages: new prom.Counter({ name: 'messages', help: 'Bridged message events', labelNames: [ 'source', 'type' ] }),
    bridged_channels: new prom.Gauge({ name: 'bridged_channels', help: 'How many channels are bridged' }),
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

    server.listen(PORT, () => logger.done(`Prometheus metrics ready`));

    async function updateMetrics() {
        metrics.bridged_channels.set(await BRIDGE_CONFIG.count({ }));
    }

    updateMetrics();
    setInterval(updateMetrics, 1000 * 10);
}

export { metrics }
