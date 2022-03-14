import { app, db } from '../..';
import { Request, Response } from 'express';
import { badRequest, getPermissionLevel, isAuthenticated, requireAuth, unauthorized } from '../../utils';
import { botReq } from '../internal/ws';

type User = { id: string, username?: string, avatarURL?: string }
type Channel = { id: string, name: string, icon?: string, type: 'VOICE'|'TEXT', nsfw: boolean }

type ServerDetails = {
    id: string,
    perms: 0|1|2|3,
    name: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig: any,
    users: User[],
    channels: Channel[],
}

app.get('/dash/server/:server', requireAuth({ permission: 0 }), async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

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

app.put('/dash/server/:server/:option', async (req: Request, res: Response) => {
    try {
        const user = await isAuthenticated(req, res, true);
        if (!user) return;
    
        const { server } = req.params;
        const { item } = req.body;
        if (!server || typeof server != 'string') return badRequest(res);
    
        const permissionLevelRes = await getPermissionLevel(user, server);
        if (!permissionLevelRes.success)
            return res.status(permissionLevelRes.statusCode || 500).send({ error: permissionLevelRes.error });
    
        const servers = db.get('servers');
        const permissionLevel: 0|1|2|3 = permissionLevelRes.level;
        const settings = await servers.findOne({ id: server });
    
        switch(req.params.option) {
            case 'managers': {
                if (!item || typeof item != 'string') return badRequest(res);
                if (permissionLevel < 3) return res.status(403).send({ error: 'You are not allowed to add other bot managers.' });

                const userRes = await botReq('getUser', { user: item });
                if (!userRes.success) {
                    return res.status(404).send({ error: 'User could not be found' });
                }

                if (settings.botManagers?.includes(userRes.user.id) === true) {
                    return res.status(400).send({ error: 'This user is already manager' });
                }

                const newManagers = [ ...(settings.botManagers ?? []), userRes.user.id ];
                await servers.update({ id: server }, { $set: { botManagers: newManagers } });
                res.send({
                    success: true,
                    managers: newManagers,
                    users: [ userRes.user ],
                });
                return;
            }

            case 'mods': {
                if (!item || typeof item != 'string') return badRequest(res);
                if (permissionLevel < 2) return res.status(403).send({ error: 'You are not allowed to add other moderators.' });

                const userRes = await botReq('getUser', { user: item });
                if (!userRes.success) {
                    return res.status(404).send({ error: 'User could not be found' });
                }

                if (settings.moderators?.includes(userRes.user.id) === true) {
                    return res.status(400).send({ error: 'This user is already moderator' });
                }

                const newMods = [ ...(settings.moderators ?? []), userRes.user.id ];
                await servers.update({ id: server }, { $set: { moderators: newMods } });
                res.send({
                    success: true,
                    mods: newMods,
                    users: [ userRes.user ],
                });
                return;
            }

            case 'config': {
                function validateField(field: string, type: string[], level: 0|1|2|3): boolean {
                    if (permissionLevel < level) {
                        res.status(403).send({ error: `You are not authorized to change '${field}'` });
                        return false;
                    }

                    if (req.body?.[field] != undefined && !type.includes(typeof req.body?.[field])) {
                        res.status(400).send({ error: `Field '${field}' needs to be of type ${type} or null` });
                        return false;
                    }

                    return true;
                }

                type RequestBody = {
                    prefix?: string,
                    spaceAfterPrefix?: boolean,
                }

                if (!validateField('prefix', ['string'], 2) ||
                    !validateField('spaceAfterPrefix', ['boolean'], 2)
                ) return;

                const body: RequestBody = req.body;

                await db.get('servers').update({ id: server }, {
                    $set: JSON.parse(JSON.stringify({ // Get rid of undefined fields
                        prefix: body.prefix == '' ? null : body.prefix,
                        spaceAfterPrefix: body.spaceAfterPrefix,
                    })),
                });

                return res.send({ success: true });
            }

            default: return badRequest(res);
        }
    } catch(e: any) {
        console.error(e);
        res.status(500).send({ error: e });
    }
});

app.delete('/dash/server/:server/:option/:target', async (req: Request, res: Response, next) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return unauthorized(res);

    const { server, target, option } = req.params;
    if (!server || typeof server != 'string' || !target || typeof target != 'string') return badRequest(res);

    const permissionLevelRes = await getPermissionLevel(user, server);
    if (!permissionLevelRes.success)
        return res.status(permissionLevelRes.statusCode || 500).send({ error: permissionLevelRes.error });

    const servers = db.get('servers');
    const permissionLevel: 0|1|2|3 = permissionLevelRes.level;
    const settings = await servers.findOne({ id: server });

    switch(option) {
        case 'managers': {
            if (permissionLevel < 3) return res.status(403).send({ error: 'You are not allowed to remove bot managers.' });

            if (!settings.botManagers?.includes(target)) {
                return res.status(400).send({ error: 'This user is not manager' });
            }

            const newManagers = (settings.botManagers ?? []).filter((i: string) => i != target);
            await servers.update({ id: server }, { $set: { botManagers: newManagers } });
            res.send({
                success: true,
                managers: newManagers,
            });
            return;
        }
        case 'mods': {
            if (permissionLevel < 2) return res.status(403).send({ error: 'You are not allowed to remove moderators.' });

            if (!settings.moderators?.includes(target)) {
                return res.status(400).send({ error: 'This user is not moderator' });
            }

            const newMods = (settings.moderators ?? []).filter((i: string) => i != target);
            await servers.update({ id: server }, { $set: { moderators: newMods } });
            res.send({
                success: true,
                mods: newMods,
            });
            return;
        }
        default: next();
    }
});
