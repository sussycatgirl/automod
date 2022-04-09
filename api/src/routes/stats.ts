import { app, db, logger } from '..';
import { Request, Response } from 'express';
import { botReq } from './internal/ws';

let SERVER_COUNT = 0;

const fetchStats = async () => {
    try {
        const res = await botReq('stats');
        if (!res.success) return logger.warn(`Failed to fetch bot stats: ${res.statusCode} / ${res.error}`);
        if (res.servers) SERVER_COUNT = Number(res.servers);
    } catch(e) {
        console.error(e);
    }
}

fetchStats();
setInterval(() => fetchStats(), 10000);

app.get('/stats', async (req: Request, res: Response) => {
    res.send({
        servers: SERVER_COUNT,
    });
});

app.get('/stats/global_blacklist', async (req: Request, res: Response) => {
    try {
        const users = await db.get('users').find({ globalBlacklist: true });

        res.send({
            total: users.length,
            blacklist: users.map(u => ({ id: u.id?.toUpperCase() })),
        });
    } catch(e) {
        console.error(''+e);
    }
});
