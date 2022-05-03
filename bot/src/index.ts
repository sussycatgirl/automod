import { config } from 'dotenv';
config();

import logger from './bot/logger';
import AutomodClient, { login } from './struct/AutomodClient';
import MongoDB from './bot/db';
import DbUser from './struct/DbUser';
import ServerConfig from './struct/ServerConfig';
import Infraction from './struct/antispam/Infraction';
import PendingLogin from './struct/PendingLogin';
import TempBan from './struct/TempBan';
import { VoteEntry } from './bot/commands/moderation/votekick';
import ScannedUser from './struct/ScannedUser';
import BridgeRequest from './struct/BridgeRequest';
import BridgeConfig from './struct/BridgeConfig';
import BridgedMessage from './struct/BridgedMessage';

logger.info('Initializing client');

let db = MongoDB();
let client = new AutomodClient({
//    pongTimeout: 10,
//    onPongTimeout: 'RECONNECT',
    fixReplyCrash: true,
    messageTimeoutFix: true,
    apiURL: process.env.API_URL,
    messageRateLimiter: true,
}, db);
login(client);

const dbs = {
    SERVERS: db.get<ServerConfig>('servers'),
    USERS: db.get<DbUser>('users'),
    INFRACTIONS: db.get<Infraction>('infractions'),
    PENDING_LOGINS: db.get<PendingLogin>('pending_logins'),
    SESSIONS: db.get('sessions'),
    TEMPBANS: db.get<TempBan>('tempbans'),
    VOTEKICKS: db.get<VoteEntry>('votekicks'),
    SCANNED_USERS: db.get<ScannedUser>('scanned_users'),
    BRIDGE_CONFIG: db.get<BridgeConfig>('bridge_config'),
    BRIDGED_MESSAGES: db.get<BridgedMessage>('bridged_messages'),
    BRIDGE_REQUESTS: db.get<BridgeRequest>('bridge_requests'),
}

export { client, dbs }

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
    import('./bot/modules/bot_status');
    import('./bot/modules/fetch_all');
})();
