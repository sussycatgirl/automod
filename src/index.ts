require('dotenv').config();

import logger from './bot/logger';
import AutomodClient, { login } from './struct/AutomodClient';
import MongoDB from './bot/db';

logger.info('Initializing client');

let db = MongoDB();
let client = new AutomodClient({ pongTimeout: 10, onPongTimeout: 'RECONNECT' }, db);
login(client);

export { client }

// Load modules
import('./bot/modules/command_handler');
import('./bot/modules/mod_logs');
