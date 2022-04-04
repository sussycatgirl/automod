import Monk from 'monk';
import { logger } from '.';

function getDb() {
    const db = Monk(process.env['DB_STRING']!);
    return db;
}

export { getDb }
