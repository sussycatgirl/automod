// Quick and dirty hack for https://github.com/revoltchat/revite/issues/609
// We periodically poll the `ready` WS event by creating a new client and compare
// the cached server count. If a new server is found, the original client reconnects
// and emits the `member/join` event for itself afterwards.

import { Client } from "@janderedev/revolt.js";
import { client } from "../..";
import logger from "../logger";
import { awaitClient } from "../util";

awaitClient().then(async () => {
    setInterval(async () => {
        logger.debug('Checking for unknown servers');
        const knownServers = Array.from(client.servers.keys());
        const tmpClient = new Client({
            ...client.options,
        });

        tmpClient.loginBot(process.env['BOT_TOKEN']!);

        tmpClient.once('ready', async () => {
            const tmpServers = Array.from(tmpClient.servers.keys());
            if (tmpServers.length != knownServers.length) {
                logger.warn('New unknown server(s) detected');

                client.websocket.disconnect();
                client.websocket.connect();

                client.once('connected', async () => {
                    console.info('Client reconnected');
                    for (const id of tmpServers) {
                        if (!knownServers.includes(id)) {
                            try {
                                const server = client.servers.get(id) || await client.servers.fetch(id);
                                const member = server.member;
                                if (!member) continue;

                                client.emit('member/join', member);
                            } catch(e) {
                                console.error(e);
                            }
                        }
                    }
                });
            }
            tmpClient.websocket.disconnect();
        });
    }, 1000 * 15);
});
