import path from 'path';
import { client } from '../..';
import logger from '../logger';

if (process.env['AUTOMOD_LOAD_SPAM_DETECTION']) {
    logger.info('Importing spam detection');
    import(path.join(process.cwd(), '..', 'private', 'automod-spam-detection', 'dist', 'index.js'))
        .then(mod => mod.raidDetection(client as any, logger, client.db, process.env.REDIS_URL));
}
