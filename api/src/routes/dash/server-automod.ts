import { app, db } from '../..';
import { Request, Response } from 'express';
import { badRequest, isAuthenticated, requireAuth, unauthorized } from '../../utils';
import { botReq } from '../internal/ws';
import { FindOneResult } from 'monk';

type AntispamRule = {
    id: string;
    max_msg: number;
    timeframe: number;
    action: 0|1|2|3|4;
    channels: string[] | null;
    message: string | null;
}

app.get('/dash/server/:server/automod',requireAuth({ permission: 2 }) , async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server } = req.params;
    if (!server || typeof server != 'string') return badRequest(res);

    const response = await botReq('getUserServerDetails', { user, server });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response.server) return res.status(404).send({ error: 'Server not found' });

    const permissionLevel: 0|1|2|3 = response.perms;
    if (permissionLevel < 1) return unauthorized(res, `Only moderators and bot managers may view this.`);

    const serverConfig: FindOneResult<any> = await db.get('servers').findOne({ id: server });
    
    const result = {
        antispam: (serverConfig.automodSettings?.spam as AntispamRule[]|undefined)
            ?.map(r => ({                // Removing unwanted fields from response
                action: r.action,
                channels: r.channels,
                id: r.id,
                max_msg: r.max_msg,
                message: r.message,
                timeframe: r.timeframe,
            } as AntispamRule))
            ?? []
    }

    res.send(result);
});

app.patch('/dash/server/:server/automod/:ruleid', requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server, ruleid } = req.params;
    const body = req.body;
    if (!server || !ruleid) return badRequest(res);

    const serverConfig: FindOneResult<any> = await db.get('servers').findOne({ id: server });
    const antiSpamRules: AntispamRule[] = serverConfig.automodSettings?.spam ?? [];

    const rule = antiSpamRules.find(r => r.id == ruleid);
    if (!rule) return res.status(404).send({ error: 'No rule with this ID could be found.' });

    await db.get('servers').update({
        id: server
    }, {
        $set: {
            "automodSettings.spam.$[rulefilter]": {
                ...rule,
                action: body.action ?? rule.action,
                channels: body.channels ?? rule.channels,
                message: body.message ?? rule.message,
                max_msg: body.max_msg ?? rule.max_msg,
                timeframe: body.timeframe ?? rule.timeframe,
                
            } as AntispamRule
        }
    }, { arrayFilters: [ { "rulefilter.id": ruleid } ] });

    return res.send({ success: true });
});
