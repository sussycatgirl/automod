import { config } from 'dotenv';
import Express from "express";
import Log75, { LogLevel } from 'log75';

config();

const PORT = Number(process.env.API_PORT || 9000);
const DEBUG = process.env.NODE_ENV != 'production';

const logger: Log75 = new (Log75 as any).default(DEBUG ? LogLevel.Debug : LogLevel.Standard);
const app = Express();

export { logger, app, PORT }

(async () => {
    await Promise.all([
        import('./middlewares/log'),
        import('./routes/internal/ws'),
        import('./routes/root'),
    ]);
    logger.done('All routes and middlewares loaded');
})();

import('./server');
