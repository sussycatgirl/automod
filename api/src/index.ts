import { config } from 'dotenv';
import Express from "express";
import Log75, { LogLevel } from 'log75';
import buildDBClient, { redis } from './db';

config();

const PORT = Number(process.env.API_PORT || 9000);
const DEBUG = process.env.NODE_ENV != 'production';
const SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 7;

const logger: Log75 = new (Log75 as any).default(DEBUG ? LogLevel.Debug : LogLevel.Standard);
const db = buildDBClient();
const app = Express();

app.set('trust proxy', true);
app.use(Express.json());

export { logger, app, db, PORT, SESSION_LIFETIME }

(async () => {
    await redis.connect();

    const promises = [
        import('./middlewares/log'),
        import('./middlewares/updateTokenExpiry'),
        import('./middlewares/cors'),
        import('./middlewares/ratelimit'),

        import('./routes/internal/ws'),
        import('./routes/root'),
        import('./routes/stats'),
        import('./routes/login'),
        import('./routes/dash/servers'),
        import('./routes/dash/server'),
        import('./routes/dash/server-automod'),
    ];

    for (const p of promises) await p;


    logger.done('All routes and middlewares loaded');
})();

import('./server');
