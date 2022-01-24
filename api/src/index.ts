import { config } from 'dotenv';
import Express from "express";
import Log75, { LogLevel } from 'log75';
import buildDBClient from './db';

config();

const PORT = Number(process.env.API_PORT || 9000);
const DEBUG = process.env.NODE_ENV != 'production';
const SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 7;

const logger: Log75 = new (Log75 as any).default(DEBUG ? LogLevel.Debug : LogLevel.Standard);
const db = buildDBClient();
const app = Express();

app.use(Express.json());

export { logger, app, db, PORT, SESSION_LIFETIME }

(async () => {
    await Promise.all([
        import('./middlewares/log'),
        import('./middlewares/updateTokenExpiry'),
        import('./middlewares/cors'),
        import('./routes/internal/ws'),
        import('./routes/root'),
        import('./routes/login'),
        import('./routes/dash/servers'),
    ]);
    logger.done('All routes and middlewares loaded');
})();

import('./server');
