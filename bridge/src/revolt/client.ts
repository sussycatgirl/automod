import { Client } from 'revolt.js';
import { logger } from '..';

let AUTUMN_URL: string = '';

const client = new Client({
    baseURL: process.env.REVOLT_API_URL || 'https://api.revolt.chat',
    autoReconnect: true,
});

const login = () => new Promise((resolve: (value: Client) => void) => {
    client.loginBot(process.env['REVOLT_TOKEN']!);
    client.once('ready', async () => {
        logger.info(`Revolt: ${client.user?.username} ready - ${client.servers.size()} servers`);
        AUTUMN_URL = client.configuration?.features.autumn.url ?? '';

        resolve(client);
    });
});

import('./events');

export { client, login, AUTUMN_URL }
