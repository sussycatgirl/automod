import crypto from 'crypto';
import { app, SESSION_LIFETIME } from '..';
import { Request, Response } from 'express';
import { botReq } from './internal/ws';
import { db } from '..';
import { FindOneResult } from 'monk';
import { badRequest, isAuthenticated, requireAuth } from '../utils';
import { RateLimiter } from '../middlewares/ratelimit';

class BeginReqBody {
    user: string;
}
class CompleteReqBody {
    user: string;
    nonce: string;
    code: string;
}

const beginRatelimiter = new RateLimiter('/login/begin', { limit: 10, timeframe: 300 });
const completeRatelimiter = new RateLimiter('/login/complete', { limit: 5, timeframe: 30 });

app.post('/login/begin',
        (...args) => beginRatelimiter.execute(...args),
        requireAuth({ noAuthOnly: true }),
        async (req: Request, res: Response) => {
    if (typeof await isAuthenticated(req) == 'string') return res.status(403).send({ error: 'You are already authenticated' });

    const body = req.body as BeginReqBody;
    if (!body.user || typeof body.user != 'string') return badRequest(res);

    const r = await botReq('requestLogin', { user: body.user.toLowerCase() });

    if (!r.success) return res.status(r.statusCode ?? 500).send(JSON.stringify({ error: r.error }, null, 4));

    res.status(200).send({ success: true, nonce: r.nonce, code: r.code, uid: r.uid });
});

app.post('/login/complete',
        (...args) => completeRatelimiter.execute(...args),
        requireAuth({ noAuthOnly: true }),
        async (req: Request, res: Response) => {
    const body = req.body as CompleteReqBody;
    if ((!body.user || typeof body.user != 'string') ||
        (!body.nonce || typeof body.nonce != 'string') ||
        (!body.code || typeof body.code != 'string')) return badRequest(res);

    const loginAttempt: FindOneResult<any> = await db.get('pending_logins').findOne({
        code: body.code,
        user: body.user,
        nonce: body.nonce,
        exchanged: false,
        invalid: false,
    });

        if (!loginAttempt) return res.status(404).send({ error: 'The provided login info could not be found.' });

    if (!loginAttempt.confirmed) {
        return res.status(400).send({ error: "This code is not yet valid." });
    }

    const sessionToken = crypto.randomBytes(48).toString('base64').replace(/=/g, '');


    await Promise.all([
        db.get('sessions').insert({
            user: body.user.toUpperCase(),
            token: sessionToken,
            nonce: body.nonce,
            invalid: false,
            expires: Date.now() + SESSION_LIFETIME,
        }),
        db.get('pending_logins').update({ _id: loginAttempt._id }, { $set: { exchanged: true } }),
    ]);

    res.status(200).send({ success: true, user: body.user.toUpperCase(), token: sessionToken });
});
