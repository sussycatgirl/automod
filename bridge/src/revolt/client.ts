import { Client } from '@janderedev/revolt.js';
import { logger } from '..';

const client = new Client({
    messageTimeoutFix: true,
    autoReconnect: true,
    onPongTimeout: 'RECONNECT',
});

const login = () => new Promise((resolve: (value: Client) => void) => {
    client.loginBot(process.env['REVOLT_TOKEN']!);
    client.once('ready', () => {
        logger.info(`Revolt: ${client.user?.username} ready - ${client.servers.size} servers`);
        resolve(client);
    });
});

import('./events');

export { client, login }
