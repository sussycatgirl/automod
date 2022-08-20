import prom from 'prom-client';
import http from 'http';
import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from ".";

const PORT = Number(process.env.BRIDGE_METRICS_PORT);

prom.collectDefaultMetrics({ prefix: "automod_bridge_" });

const metrics = {
    messages: new prom.Counter({
        name: "messages",
        help: "Bridged message events",
        labelNames: ["source", "type"],
    }),
    bridged_channels: new prom.Gauge({
        name: "bridged_channels",
        help: "How many channels are bridged",
    }),
    db_messages: new prom.Gauge({
        name: "db_messages",
        help: "Number of bridged message documents in the database",
        labelNames: ["source"],
    }),
};

if (!isNaN(PORT)) {
    logger.info(`Enabling Prometheus metrics on :${PORT}`);

    const server = new http.Server();

    server.on("request", async (req, res) => {
        if (req.url == "/metrics") {
            res.write(await prom.register.metrics());
            res.end();
        } else {
            res.statusCode = 404;
            res.write("404 not found");
            res.end();
        }
    });

    server.listen(PORT, () => logger.done(`Prometheus metrics ready`));

    async function updateMetrics() {
        const now = Date.now();

        metrics.bridged_channels.set(await BRIDGE_CONFIG.count({}));

        const [revolt, discord] = await Promise.all([
            BRIDGED_MESSAGES.count({ origin: "revolt" }),
            BRIDGED_MESSAGES.count({ origin: "discord" }),
        ]);

        metrics.db_messages.set({ source: "revolt" }, revolt);
        metrics.db_messages.set({ source: "discord" }, discord);

        logger.debug(`Fetching database metrics took ${Date.now() - now} ms`);
    }

    updateMetrics();
    setInterval(updateMetrics, 1000 * 60);
}

export { metrics }
