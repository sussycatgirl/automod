import { User } from 'revolt.js';
import { client } from '../../..';
import { getMutualServers, getPermissionLevel } from '../../util';
import { wsEvents, WSResponse } from '../api_communication';

type ReqData = { user: string }

wsEvents.on('req:getUserServers', async (data: ReqData, cb: (data: WSResponse) => void) => {
    try {
        let user: User;
        try {
            user = client.users.get(data.user) || await client.users.fetch(data.user);
        } catch(e) {
            cb({ success: false, error: 'The requested user could not be found', statusCode: 404 });
            return;
        }

        const mutuals = getMutualServers(user);

        type ServerResponse = { id: string, perms: 0|1|2|3, name: string, iconURL?: string, bannerURL?: string }

        const promises: Promise<ServerResponse>[] = [];

        for (const server of mutuals) {
            promises.push(new Promise(async (resolve, reject) => {
                try {
                    if (!server) return reject('Server not found');
                    const perms = await getPermissionLevel(user, server);
                    resolve({
                        id: server.id,
                        perms,
                        name: server.name,
                        bannerURL: server.bannerURL,
                        iconURL: server.iconURL,
                    });
                } catch(e) {
                    console.error(e);
                    reject(`${e}`);
                }
            }));
        }

        cb({
            success: true,
            servers: (await Promise.allSettled(promises)).map(
                p => p.status == 'fulfilled' ? p.value : undefined
            ),
        });
    } catch(e) {
        console.error(e);
        cb({ success: false, error: `${e}` });
    }
});
