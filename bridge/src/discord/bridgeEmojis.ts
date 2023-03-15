import axios from "axios";
import { GuildEmoji } from "discord.js";
import JSON5 from 'json5';
import { BRIDGED_EMOJIS, logger } from "..";
import { client } from "./client";

const EMOJI_DICT_URL = 'https://raw.githubusercontent.com/revoltchat/revite/master/src/assets/emojis.ts';
const EMOJI_URL_BASE = 'https://dl.insrt.uk/projects/revolt/emotes/';
const EMOJI_SERVERS = process.env.EMOJI_SERVERS?.split(',') || [];

async function fetchEmojiList(): Promise<Record<string, string>> {
    const file: string = (await axios.get(EMOJI_DICT_URL)).data;
    const start = file.indexOf('...{') + 3;
    const end = file.indexOf('},') + 1;

    return JSON5.parse(
        file.substring(start, end)
            .replace(/^\s*[0-9]+:/gm, (match) => `"${match.replace(/(^\s+)|(:$)/g, '')}":`)
            .trim()
    );
}

const emojiUpdate = async () => {
    try {
        if (!EMOJI_SERVERS.length) return logger.info('$EMOJI_SERVERS not set, not bridging emojis.');

        if (!client.readyAt) await new Promise(r => client.once('ready', r));
        logger.info('Updating bridged emojis. Due to Discord rate limits, this can take a few hours to complete.');

        const emojis = await fetchEmojiList();
        logger.info(`Downloaded emoji list: ${Object.keys(emojis).length} emojis.`);

        const servers = await Promise.all(EMOJI_SERVERS.map(id => client.guilds.fetch(id)));
        await Promise.all(servers.map(server => server.emojis.fetch())); // Make sure all emojis are cached

        const findFreeServer = (animated: boolean) => servers.find(
            server => server.emojis.cache
                .filter(e => e.animated == animated)
                .size < 50
        );

        // Remove unknown emojis from servers
        for (const server of servers) {
            for (const emoji of server.emojis.cache) {
                const dbEmoji = await BRIDGED_EMOJIS.findOne({
                    emojiid: emoji[1].id,
                });

                if (!dbEmoji) {
                    try {
                        logger.info('Found unknown emoji; deleting.');
                        await emoji[1].delete('Unknown emoji');
                    } catch(e) {
                        logger.warn('Failed to delete emoji: ' + e);
                    }
                }
            }
        }

        for (const emoji of Object.entries(emojis)) {
            const dbEmoji = await BRIDGED_EMOJIS.findOne({
                $or: [
                    { name: emoji[0] },
                    { originalFileUrl: emoji[1] },
                ],
            });

            if (!dbEmoji) {
                // Upload to Discord
                logger.debug('Uploading emoji: ' + emoji[1]);

                const fileurl = EMOJI_URL_BASE + emoji[1].replace('custom:', '');
                const server = findFreeServer(emoji[1].endsWith('.gif'));

                if (!server) {
                    logger.warn('Could not find a server with free emoji slots for ' + emoji[1]);
                    continue;
                }

                let e: GuildEmoji;
                try {
                    e = await server.emojis.create(fileurl, emoji[0], { reason: 'Bridged Emoji' });
                } catch(e) {
                    logger.warn(emoji[0] + ': Failed to upload emoji: ' + e);
                    continue;
                }

                await BRIDGED_EMOJIS.insert({
                    animated: e.animated || false,
                    emojiid: e.id,
                    name: emoji[0],
                    originalFileUrl: fileurl,
                    server: e.guild.id,
                });
            }
            else {
                // Double check if emoji exists
                let exists = false;
                for (const server of servers) {
                    if (server.emojis.cache.find(e => e.id == dbEmoji.emojiid)) {
                        exists = true;
                        break;
                    }
                }

                if (!exists) {
                    logger.info(`Emoji ${emoji[0]} does not exist; reuploading.`);
                    await BRIDGED_EMOJIS.remove({ emojiid: dbEmoji.emojiid });

                    const fileurl = EMOJI_URL_BASE + emoji[1].replace('custom:', '');
                    const server = findFreeServer(emoji[1].endsWith('.gif'));

                    if (!server) {
                        logger.warn('Could not find a server with free emoji slots for ' + emoji[1]);
                        continue;
                    }

                    let e: GuildEmoji;
                    try {
                        e = await server.emojis.create(fileurl, emoji[0], { reason: 'Bridged Emoji' });
                    } catch(e) {
                        logger.warn(emoji[0] + ': Failed to upload emoji: ' + e);
                        continue;
                    }

                    await BRIDGED_EMOJIS.insert({
                        animated: e.animated || false,
                        emojiid: e.id,
                        name: emoji[0],
                        originalFileUrl: fileurl,
                        server: e.guild.id,
                    });
                }
            }
        };

        logger.done('Emoji update finished.');
    } catch(e) {
        logger.error('Updating bridged emojis failed');
        console.error(e);
    }
};

emojiUpdate();
setInterval(emojiUpdate, 1000 * 60 * 60 * 6); // Every 6h

export { fetchEmojiList }
