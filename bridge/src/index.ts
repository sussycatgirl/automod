import { config } from 'dotenv';
import Log75, { LogLevel } from 'log75';
import { getDb } from './db';
import { login as loginRevolt } from './revolt/client';
import { login as loginDiscord } from './discord/client';
import { ICollection } from 'monk';
import BridgeConfig from './types/BridgeConfig';
import BridgedMessage from './types/BridgedMessage';
import BridgeRequest from './types/BridgeRequest';

config();

const logger: Log75 = new (Log75 as any).default(LogLevel.Debug);
const db = getDb();
const BRIDGED_MESSAGES: ICollection<BridgedMessage> = db.get('bridged_messages');
const BRIDGE_CONFIG: ICollection<BridgeConfig> = db.get('bridge_config');
const BRIDGE_REQUESTS: ICollection<BridgeRequest> = db.get('bridge_requests');

for (const v of [ 'REVOLT_TOKEN', 'DISCORD_TOKEN', 'DB_STRING' ]) {
    if (!process.env[v]) {
        logger.error(`Env var $${v} expected but not set`);
        process.exit(1);
    }
}

(async () => {
    import('./metrics');
    const [ revolt, discord ] = await Promise.allSettled([
        loginRevolt(),
        loginDiscord(),
    ]);
})();

export { logger, db, BRIDGED_MESSAGES, BRIDGE_CONFIG, BRIDGE_REQUESTS }
