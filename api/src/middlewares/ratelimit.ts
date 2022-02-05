import { Request, Response } from "express";
import { FindOneResult } from "monk";
import { app, db, logger } from "..";

const ratelimits = db.get('ratelimits');

type RateLimitObject = {
    ip: string,
    requests: { route: string, time: number }[],
    lastActivity: number,
}

// Might use redis here later, idk
// I am also aware that there's better ways to do this

class RateLimiter {
    route: string;
    limit: number;
    timeframe: number;

    constructor(route: string, limits: { limit: number, timeframe: number }) {
        this.route = route;
        this.limit = limits.limit;
        this.timeframe = limits.timeframe;
    }

    async execute(req: Request, res: Response, next: () => void) {
        try {
            const ip = req.ip;
            const now = Date.now();

            const entry: FindOneResult<RateLimitObject> = await ratelimits.findOne({ ip });
            if (!entry) {
                logger.debug('Ratelimiter: Request from new IP address, creating new document');
                next();
                await ratelimits.insert({
                    ip,
                    lastActivity: now,
                    requests: [{ route: this.route, time: now }],
                });
                return;
            }

            const reqs = entry.requests.filter(
                r => r.route == this.route && r.time > now - (this.timeframe * 1000)
            );

            if (reqs.length >= this.limit) {
                logger.debug(`Ratelimiter: IP address exceeded ratelimit for ${this.route} [${this.limit}/${this.timeframe}]`);
                res
                    .status(429)
                    .send({
                        error: 'You are being rate limited.',
                        limit: this.limit,
                        timeframe: this.timeframe,
                    });
            } else next();

            // Can't put a $push and $pull into the same query
            await Promise.all([
                ratelimits.update({ ip }, {
                    $push: {
                        requests: { route: this.route, time: now }
                    },
                    $set: {
                        lastActivity: now
                    }
                }),
                ratelimits.update({ ip }, {
                    $pull: {
                        requests: {
                            route: this.route,
                            time: {
                                $lt: now - (this.timeframe * 1000)
                            }
                        }
                    }
                }),
            ]);
        } catch(e) { console.error(e) }
    }
}

app.use('*', (...args) => (new RateLimiter('*', { limit: 20, timeframe: 1 })).execute(...args));

// Delete all documents where the last
// activity was more than 24 hours ago.
// This ensures that we don't store
// personally identifying data for longer
// than required.

const cleanDocuments = async () => {
    try {
        logger.info('Ratelimiter: Deleting old documents');

        const { deletedCount } = await ratelimits.remove({
            lastActivity: { $lt: Date.now() - 1000 * 60 * 60 * 24 }
        }, { multi: true });

        logger.done(`Ratelimiter: Deleted ${deletedCount ?? '??'} documents.`);
    } catch(e) {
        console.error(e);
    }
}

setTimeout(cleanDocuments, 1000 * 10);
setInterval(cleanDocuments, 10000 * 60 * 60);

export { RateLimiter }
