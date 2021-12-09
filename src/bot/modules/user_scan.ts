import { client } from "../..";
import fs from 'fs';
import { FindOneResult } from "monk";
import ScannedUser from "../../struct/ScannedUser";
import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import ServerConfig from "../../struct/ServerConfig";
import { MessageEmbed, WebhookClient } from "discord.js";
import logger from "../logger";

let { USERSCAN_WORDLIST_PATH } = process.env;

let wordlist = USERSCAN_WORDLIST_PATH
    ? fs.readFileSync(USERSCAN_WORDLIST_PATH, 'utf8')
        .split('\n')
        .map(word => minifyText(word))
        .filter(word => word.length > 0)
    : null;

let scannedUsers = client.db.get('scanned_users');
let serverConfig: Map<string, ServerConfig> = new Map();
let userScanTimeout: Map<string, number> = new Map();

async function scanServer(id: string, userScanned: () => void, done: () => void) {
    if (!wordlist) return;
    let conf: FindOneResult<ServerConfig> = await client.db.get('servers').findOne({ id: id });
    serverConfig.set(id, conf as ServerConfig);
    if (!conf?.userScan?.enable) return;

    try {
        logger.debug(`Scanning user list for ${id}`);

        let server = client.servers.get(id) || await client.servers.fetch(id);
        let members = await server.fetchMembers(); // This can take multiple seconds, depending on the size of the server

        for (const member of members.members) {
            if (!member.user?.bot && member._id.user != client.user?._id) {
                userScanned();
                await scanUser(member);
            }
        }

        done();
    } catch(e) { console.error(e) }
}

async function scanUser(member: Member) {
    if (!wordlist) return;

    try {
        let dbEntry: FindOneResult<ScannedUser|undefined>
            = await scannedUsers.findOne({ id: member._id.user, server: member.server?._id });
        let user = member.user || await client.users.fetch(member._id.user);
        let profile = await user.fetchProfile();
        let report = false;

        if (dbEntry) {
            if (dbEntry.approved) return;
            if (dbEntry.lastLog > Date.now() - (1000 * 60 * 60 * 48)) return;
        }

        for (const word of wordlist) {
            for (const text of [ user?.username, member.nickname, profile.content, user.status?.text ]) {
                if (text && minifyText(text).includes(word)) report = true;
            }
        }

        if (report) {
            if (dbEntry) {
                await scannedUsers.update({ _id: dbEntry._id }, {
                    $set: {
                        lastLog: Date.now(),
                        lastLoggedProfile: {
                            username: user.username,
                            nickname: member.nickname,
                            profile: profile.content,
                            status: user.status?.text,
                        }
                    }
                });
            } else {
                await scannedUsers.insert({
                    approved: false,
                    id: user._id,
                    lastLog: Date.now(),
                    server: member.server!._id,
                    lastLoggedProfile: {
                        username: user.username,
                        nickname: member.nickname,
                        profile: profile.content,
                        status: user.status?.text,
                    }
                } as ScannedUser);
            }

            await logUser(member, profile);
        }
    } catch(e) { console.error(e) }
}


async function logUser(member: Member, profile: any) { // `Profile` type doesn't seem to be exported by revolt.js
    try {
        let conf = serverConfig.get(member.server!._id);
        if (!conf || !conf.userScan?.enable) return;

        if (conf.userScan.discordWebhook) {
            try {
                let embed = new MessageEmbed()
                    .setTitle('Potentially suspicious user found')
                    .setAuthor(`${member.user?.username ?? 'Unknown user'} | ${member._id.user}`, member.generateAvatarURL());

                if (member.nickname) embed.addField('Nickname', member.nickname || 'None', true);
                if (member.user?.status?.text) embed.addField('Status', member.user.status.text || 'None', true);
                embed.addField('Profile', ((profile?.content || 'No about me text') as string).substr(0, 1000));

                if (profile.background) {
                    let url = client.generateFileURL({
                        _id: profile.background._id,
                        tag: profile.background.tag,
                        content_type: profile.background.content_type,
                    }, undefined, true);

                    if (url) embed.setImage(url);
                }

                let whClient = new WebhookClient({ url: conf.userScan.discordWebhook });
                await whClient.send({ embeds: [ embed ] });
                whClient.destroy();
            } catch(e) { console.error(e) }
        }

        if (conf.userScan.logChannel) {
            try {
                let channel = client.channels.get(conf.userScan.logChannel)
                            || await client.channels.fetch(conf.userScan.logChannel);
                
                let msg = `## Potentially suspicious user found\n`
                        + `The profile <@${member._id.user}> (${member._id.user}) might contain abusive content.`;

                await channel.sendMessage(msg);
            } catch(e) { console.error(e) }
        }
    } catch(e) { console.error(e) }
}

// Removes symbols from a text to make it easier to match against the wordlist
function minifyText(text: string) {
    return text
        .toLowerCase()
        .replace(/\s_./g, '');
}

new Promise((res: (value: void) => void) => client.user ? res() : client.once('ready', res)).then(() => {
    client.on('packet', async packet => {
        if (!wordlist) return;
        if (packet.type == 'UserUpdate') {
            try {
                let user = client.users.get(packet.id);
                if (!user || user.bot || user._id == client.user?._id) return;
                let mutual = await user.fetchMutual();

                mutual.servers.forEach(async sid => {
                    let server = client.servers.get(sid);
                    if (!server) return;

                    let conf: FindOneResult<ServerConfig> = await client.db.get('servers').findOne({ id: server._id });
                    serverConfig.set(server._id, conf as ServerConfig);

                    if (conf?.userScan?.enable) {
                        let member = await server.fetchMember(packet.id);
                        let t = userScanTimeout.get(member._id.user);
                        if (t && t > (Date.now() - 10000)) return;
                        userScanTimeout.set(member._id.user, Date.now());
                        scanUser(member);
                    }
                });
            } catch(e) { console.error(e) }
        }
    });

    client.on('member/join', async (member) => {
        if (!wordlist) return;

        try {
            let user = member.user || await client.users.fetch(member._id.user);
            if (!user || user.bot || user._id == client.user?._id) return;

            let server = member.server || await client.servers.fetch(member._id.server);
            if (!server) return;

            let conf: FindOneResult<ServerConfig> = await client.db.get('servers').findOne({ id: server._id });
            serverConfig.set(server._id, conf as ServerConfig);

            if (conf?.userScan?.enable) {
                let t = userScanTimeout.get(member._id.user);
                if (t && t > (Date.now() - 10000)) return;
                userScanTimeout.set(member._id.user, Date.now());
                scanUser(member);
            }
        } catch(e) { console.error(e) }
    });
});

export { scanServer };
