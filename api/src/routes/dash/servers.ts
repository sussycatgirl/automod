import { app } from '../..';
import { Request, Response } from 'express';
import { isAuthenticated } from '../../utils';
import { botReq } from '../internal/ws';

type Server = { id: string, perms: 0|1|2, name: string, iconURL?: string, bannerURL?: string }

app.get('/dash/servers', async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const response = await botReq('getUserServers', { user });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response.servers) return res.status(404).send({ error: 'Not found' });

    const servers: Server[] = response.servers;
    res.send({ servers });
});
