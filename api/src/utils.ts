import { Request, Response } from "express";
import { FindOneResult } from "monk";
import { db } from ".";
import { botReq } from "./routes/internal/ws";

class Session {
    user: string;
    token: string;
    nonce: string;
    expires: number;
    invalid: boolean;
}

/**
 * 
 * @param req 
 * @returns false if not authenticated, otherwise the (Revolt) user ID
 */
async function isAuthenticated(req: Request, res?: Response, send401?: boolean): Promise<string|false> {
    const user = req.header('x-auth-user');
    const token = req.header('x-auth-token');

    if (!user || !token) return false;

    const info = await getSessionInfo(user, token);
    if (res && send401 && !info.valid) {
        res.status(401).send({ error: 'Unauthorized' });
    }
    return info.valid ? user : false;
}

type SessionInfo = { exists: boolean, valid: boolean, nonce?: string }

async function getSessionInfo(user: string, token: string): Promise<SessionInfo> {
    const session: FindOneResult<Session> = await db.get('sessions').findOne({ user, token });
    
    return { exists: !!session, valid: !!(session && !session.invalid && session.expires > Date.now()), nonce: session?.nonce }
}

function badRequest(res: Response, infoText?: string) {
    res.status(400).send(JSON.stringify({ "error": "Invalid request body", "info": infoText || undefined }, null, 4));
}

function unauthorized(res: Response, infoText?: string) {
    res.status(401).send(JSON.stringify({ "error": "Unauthorized", "info": infoText || undefined }, null, 4));
}

async function getPermissionLevel(user: string, server: string) {
    return await botReq('getPermissionLevel', { user, server });
}

type RequireAuthConfig = { permission?: 0|1|2|3, requireLogin?: boolean, noAuthOnly?: boolean }
function requireAuth(config: RequireAuthConfig): (req: Request, res: Response, next: () => void) => void {
    return async (req: Request, res: Response, next: () => void) => {
        const auth = await isAuthenticated(req);

        if (config.noAuthOnly && typeof auth == 'string') return res.status(403).send({ error: 'Cannot access this route with authentication' });
        if (config.requireLogin && !auth) return unauthorized(res, 'Authentication required for this route');

        if (config.permission != undefined) {
            if (!auth) return unauthorized(res, 'Authentication required for this route');
            const server_id = req.params.serverid || req.params.server;
            const levelRes = await getPermissionLevel(auth, server_id);
            if (!levelRes.success) return res.status(500).send({ error: 'Unknown server or other error' });
            if (levelRes.level < config.permission) return unauthorized(res, 'Your permission level is too low');
        }

        next();
    }
}

export { isAuthenticated, getSessionInfo, badRequest, unauthorized, getPermissionLevel, requireAuth }
