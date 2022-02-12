import { config } from 'dotenv';
config();

import logger from './bot/logger';
import AutomodClient, { login } from './struct/AutomodClient';
import MongoDB from './bot/db';

logger.info('Initializing client');

let db = MongoDB();
let client = new AutomodClient({
    pongTimeout: 10,
    onPongTimeout: 'RECONNECT',
    fixReplyCrash: true,
    messageTimeoutFix: true
}, db);
login(client);

export { client }

(async () => {
    // Wait for a database query to succeed before loading the rest
    logger.info('Connecting to database...');
    await db.get('servers').findOne({});
    logger.done('DB ready!');

    // Load modules
    import('./bot/modules/command_handler');
    import('./bot/modules/mod_logs');
    import('./bot/modules/event_handler');
    import('./bot/modules/tempbans');
    import('./bot/modules/user_scan');
    import('./bot/modules/api_communication');
    import('./bot/modules/metrics');
})();
