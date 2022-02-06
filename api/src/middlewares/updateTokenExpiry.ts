import { Request, Response } from "express";
import { FindOneResult } from "monk";
import { app, db, SESSION_LIFETIME } from "..";

app.use('*', async (req: Request, res: Response, next: () => void) => {
    next();

    const user = req.header('x-auth-user');
    const token = req.header('x-auth-token');

    if (!user || !token) return;

    try {
        const session: FindOneResult<any> = await db.get('sessions').findOne({ user, token, expires: { $gt: Date.now() } });
        if (session) {
            await db.get('sessions').update({ _id: session._id }, { $set: { expires: Date.now() + SESSION_LIFETIME } });
        }
    } catch(e) { console.error(e) }
});
