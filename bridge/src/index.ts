import { config } from 'dotenv';
import Log75, { LogLevel } from 'log75';
import { getDb } from './db';
import { login as loginRevolt } from './revolt/client';
import { login as loginDiscord } from './discord/client';

config();

const logger: Log75 = new (Log75 as any).default(LogLevel.Debug);
const db = getDb();
const BRIDGED_MESSAGES = db.get('bridged_messages');
const BRIDGE_CONFIG = db.get('bridge_config');

for (const v of [ 'REVOLT_TOKEN', 'DISCORD_TOKEN', 'DB_STRING' ]) {
    if (!process.env[v]) {
        logger.error(`Env var $${v} expected but not set`);
        process.exit(1);
    }
}

(async () => {
    const [ revolt, discord ] = await Promise.allSettled([
        loginRevolt(),
        loginDiscord(),
    ]);
})();

export { logger, BRIDGED_MESSAGES, BRIDGE_CONFIG }
