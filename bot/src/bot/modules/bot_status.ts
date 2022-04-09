import axios from "axios";
import { client, dbs } from "../..";
import logger from "../logger";

(async () => {
    if (!client.user) await new Promise<void>(r => client.once('ready', () => r()));
    const interval = process.env['BOT_STATUS_INTERVAL']; // In seconds
    const statuses = process.env['BOT_STATUS']
        ?.split('||')
        .map(text => text.trim());

    if (statuses?.length && interval) {
        let i = 0;

        const update = async () => {
            try {
                const statusText = statuses[i]
                    .replace('{{servers}}', `${client.servers.size}`)
                    .replace('{{users}}', `${client.users.size}`)
                    .replace('{{infractions_total}}', `${await dbs.INFRACTIONS.count({})}`)
                    .replace('{{ping_ms}}', `${client.websocket.ping ?? -1}`);

                await setStatus(statusText, 'Online');
                logger.debug(`Bot status updated`);

                i++;
                if (i >= statuses.length) i = 0;
            } catch(e) {
                console.error(`Failed to update bot status: ${e}`);
            }
        }

        update();
        setInterval(update, parseInt(interval) * 1000);
    }
})();

async function setStatus(text: string, presence: 'Online'|'Idle'|'Busy'|'Invisible') {
    await axios.patch(
        `${client.apiURL}/users/@me`,
        {
            status: { text, presence }
        },
        {
            headers: {
                'x-bot-token': process.env['BOT_TOKEN']!
            }
        }
    );
}

export { setStatus }
