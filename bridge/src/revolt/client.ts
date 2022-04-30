import { Client } from '@janderedev/revolt.js';
import axios from 'axios';
import { logger } from '..';

let AUTUMN_URL = `http://autumnUrl`;

const client = new Client({
    apiURL: process.env.REVOLT_API_URL,
});

const login = () => new Promise((resolve: (value: Client) => void) => {
    client.loginBot(process.env['REVOLT_TOKEN']!);
    client.once('ready', async () => {
        logger.info(`Revolt: ${client.user?.username} ready - ${client.servers.size} servers`);

        const apiConfig = await axios.get(client.apiURL);
        AUTUMN_URL = apiConfig.data?.features?.autumn?.url;

        resolve(client);
    });
});

import('./events');

export { client, login, AUTUMN_URL }
