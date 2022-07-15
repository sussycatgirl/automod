import { FindResult } from "monk";
import { client, dbs } from "../..";
import TempBan from "automod/dist/types/TempBan";
import logger from "../logger";

// Array of ban IDs which should not get processed in this session
let dontProcess: string[] = [];
let expired: string[] = [];

async function tick() {
    let found = await dbs.TEMPBANS.find({ until: { $lt: Date.now() + 60000 } });

    for (const ban of found) {
        if (!dontProcess.includes(ban.id))
            setTimeout(() => processUnban(ban), ban.until - Date.now());
    }
}

new Promise((r: (value: void) => void) => {
    if (client.user) r();
    else client.once('ready', r);
}).then(() => {
    tick();
    setInterval(tick, 60000);
});

async function processUnban(ban: TempBan) {
    try {
        if (expired.includes(ban.id)) return;

        let server = client.servers.get(ban.server) || await client.servers.fetch(ban.server);
        if (!server.havePermission('BanMembers')) return logger.debug(`No permission to process unbans in ${server._id}, skipping`);
        let serverBans = await server.fetchBans();

        if (serverBans.bans.find(b => b._id.user == ban.bannedUser)) {
            logger.debug(`Unbanning user ${ban.bannedUser} from ${server._id}`);

            let promises = [
                server.unbanUser(ban.bannedUser),
                dbs.TEMPBANS.remove({ id: ban.id }),
            ];

            await Promise.allSettled(promises);
        }
        else dbs.TEMPBANS.remove({ id: ban.id });
    } catch(e) { console.error(e) }
}

async function storeTempBan(ban: TempBan): Promise<void> {
    if (Date.now() >= ban.until - 60000) {
        dontProcess.push(ban.id);
        setTimeout(() => {
            processUnban(ban);
            dontProcess = dontProcess.filter(id => id != ban.id);
        }, ban.until - Date.now());
    }

    dbs.TEMPBANS.insert(ban);
}

async function removeTempBan(banID: string): Promise<TempBan> {
    let ban = await dbs.TEMPBANS.findOneAndDelete({ id: banID });
    if (!ban) throw `Ban ${banID} does not exist; cannot delete`;
    if (Date.now() >= ban.until - 120000) {
        expired.push(ban.id);
        expired = expired.filter(id => id != ban!.id);
    };
    return ban;
}

export { storeTempBan, removeTempBan };
