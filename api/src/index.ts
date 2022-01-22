import { config } from 'dotenv';
import Express, { Request, Response } from "express";
import Log75, { LogLevel } from 'log75';

config();

const PORT = Number(process.env.API_PORT || 9000);
const DEBUG = process.env.NODE_ENV != 'production';

const logger: Log75 = new (Log75 as any).default(DEBUG ? LogLevel.Debug : LogLevel.Standard);
const app = Express();

app.get('/', (req: Request, res: Response) => {
    res.send({ msg: "yo" });
});

app.listen(PORT, () => logger.info(`Listening on port ${PORT}`));
