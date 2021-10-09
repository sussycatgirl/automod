import Monk, { IMonkManager } from 'monk';
import logger from './logger';

export default (): IMonkManager => {
        let dburl = getDBUrl();
        let db = Monk(dburl);
        return db;
};

// Checks if all required env vars were supplied, and returns the mongo db URL
function getDBUrl() {
    let env = process.env;
    if (env['DB_URL']) return env['DB_URL'];

    if (!env['DB_HOST']) {
        logger.error(`Environment variable 'DB_HOST' not set, unable to connect to database`);
        logger.error(`Specify either 'DB_URL' or 'DB_HOST', 'DB_USERNAME', 'DB_PASS' and 'DB_NAME'`);
        throw 'Missing environment variables';
    }

    // mongodb://username:password@hostname:port/dbname
    let dburl = 'mongodb://';
    if (env['DB_USERNAME']) dburl += env['DB_USERNAME'];
    if (env['DB_PASS']) dburl += `:${env['DB_PASS']}`;
    dburl += `${process.env['DB_USERNAME'] ? '@' : ''}${env['DB_HOST']}`; // DB_HOST is assumed to contain the port
    dburl += `/${env['DB_NAME'] ?? 'automod'}`;

    return dburl;
}
