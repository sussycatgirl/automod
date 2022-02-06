import { app } from '..';
import { Request, Response } from 'express';
import { getSessionInfo, isAuthenticated } from '../utils';

app.get('/', async (req: Request, res: Response) => {
    const isAuthed = await isAuthenticated(req);
    res.send({
        authenticated: isAuthed,
        sessionInfo: isAuthed ? await getSessionInfo(req.header('x-auth-user')!, req.header('x-auth-token')!) : {},
    });
});