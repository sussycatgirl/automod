import { client } from "../..";
import logger from "../logger";

// Fetch all known users on bot startup.

(async () => {
    if (!client.user) await new Promise<void>(r => client.once('ready', () => r()));

    logger.info(`Starting to fetch users in ${client.servers.size} servers.`);

    const promises: Promise<any>[] = [];
    for (const server of client.servers) {
        promises.push(server[1].fetchMembers());
    }

    const res = await Promise.allSettled(promises);
    logger.done(`Downloaded all users from ${res.filter(r => r.status == 'fulfilled').length} servers `
        + `with ${res.filter(r => r.status == 'rejected').length} errors. Cache size: ${client.users.size}`);
})();
