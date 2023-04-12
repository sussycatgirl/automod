import * as Revolt from "revolt.js";
import { IMonkManager } from 'monk';
import logger from '../bot/logger';
import { adminBotLog } from "../bot/logging";
import { ClientOptions } from "revolt.js/src/Client";

class AutomodClient extends Revolt.Client {
    db: IMonkManager;

    constructor(options: Partial<ClientOptions> | undefined, monk: IMonkManager) {
        super(options);

        this.db = monk;
    }
}

let login = (client: Revolt.Client): Promise<void> => new Promise((resolve, reject) => {
    logger.info('Bot logging in...');
    let env = process.env;

    if (!env['BOT_TOKEN']) {
        logger.error('Environment variable \'BOT_TOKEN\' not provided');
        return reject('No bot token provided');
    }

    client.loginBot(env['BOT_TOKEN']);

    client.once('ready', () => {
        logger.done(`Bot logged in as ${client.user?.username}!`);
        adminBotLog({ message: 'Bot logged in', type: 'INFO' });
        resolve();
    });
});

export default AutomodClient;
export { login }
