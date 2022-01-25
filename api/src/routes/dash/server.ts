import { app } from '../..';
import { Request, Response } from 'express';
import { badRequest, isAuthenticated, unauthorized } from '../../utils';
import { botReq } from '../internal/ws';

type ServerDetails = {
    id: string,
    perms: 0|1|2,
    name: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig: any,
}

app.get('/dash/server/:server', async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return unauthorized(res);

    const { server } = req.params;
    if (!server || typeof server != 'string') return badRequest(res);

    const response = await botReq('getUserServerDetails', { user, server });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response.server) return res.status(404).send({ error: 'Not found' });

    const s: ServerDetails = response.server;
    res.send({ server: s });
});
