/**
 * Mongodb wrapper that uses redis for caching. I found out I don't
 * actually need this but I already wrote it so I'm keeping it here
 * 
 * I also don't know how well it works
 */

import { FindOneResult, ICollection, IObjectID } from 'monk';
import { createClient } from 'redis';

// createClient() returns a wacky ass type and this is the only way I can think of to get it
const _redisClient = createClient();
type RedisClient = typeof _redisClient;

class CachedDb<T> {
    db: ICollection<T>;
    redis: RedisClient;
    ttl: number = 300;
    redisPrefix: string;
    mongoIndexKey: string;
    debug: boolean = false;

    constructor(db: ICollection<T>, redis: RedisClient, indexKey: string) {
        this.db = db;
        this.redis = redis;
        this.redisPrefix = db.name;
        this.mongoIndexKey = indexKey;
    }

    /**
     * Gets a database entry and returns it
     * @param key 
     */
    get(key: string): Promise<({ _id: string | IObjectID } & T) | T | undefined> {
        return new Promise(async (resolve, reject) => {
            try {
                const res = await this.redis.GET(`${this.redisPrefix}:${key}`);
                if (res) {
                    if (this.debug) console.debug('Db: Answering from cache');
                    resolve(JSON.parse(res));
                    return;
                }
                else if (this.debug) console.debug('Db: Fetching from database');

                const mongoRes = await this.db.findOne({ [this.mongoIndexKey]: key } as any);
                resolve(mongoRes ?? undefined);

                try {
                    await this.redis.SET(`${this.redisPrefix}:${key}`, JSON.stringify(mongoRes));
                    await this.redis.EXPIRE(`${this.redisPrefix}:${key}`, this.ttl);
                } catch(e) {
                    console.warn('Failed to cache to redis:', e);
                }
            } catch(e) { reject(e) }
        });
    }

    /**
     * Inserts or updates a database entry and caches it. Overwrites existing keys
     * @param value 
     */
    set(value: T): Promise<{ ok: number; n: number; nModified: number; }> {
        return new Promise(async (resolve, reject) => {
            const key = (value as any)[this.mongoIndexKey];
            try {
                const res = await this.db.update(
                    { [this.mongoIndexKey]: key } as any,
                    value,
                    { upsert: true, replace: true, single: true }
                );
                resolve(res);
                if (!res.ok) return console.debug('Db: Not caching;', res);
            } catch(e) { reject(e) }

            try {
                if (this.debug) console.debug('Db: Caching updated document');
                await this.redis.SET(`${this.redisPrefix}:${key}`, JSON.stringify(value));
                await this.redis.EXPIRE(`${this.redisPrefix}:${key}`, this.ttl);
            } catch(e) {
                console.warn('Failed to cache to redis:', e);
            }
        });
    }

    /**
     * Inserts or updates a database entry without overwriting other keys
     * @param value 
     * @returns The updated/created document
     */
    update(key: string, value: Partial<T>): Promise<FindOneResult<T>> {
        return new Promise(async (resolve, reject) => {
            try {
                const res = await this.db.findOneAndUpdate(
                    { [this.mongoIndexKey]: key } as any,
                    { $set: value },
                    { upsert: true, returnOriginal: true } // monk is a steaming pile of garbage, i need to set the deprecated returnOriginal
                );                                         // because the fuckwarts who wrote it made it default to `false`
                resolve(res);
                if (!res) return;

                try {
                    await this.redis.SET(`${this.redisPrefix}:${key}`, JSON.stringify(res));
                    await this.redis.EXPIRE(`${this.redisPrefix}:${key}`, this.ttl);
                } catch(e) {
                    console.warn('Failed to cache to redis:', e);
                }
            } catch(e) { reject(e) }
        });
    }
}

export { CachedDb }
