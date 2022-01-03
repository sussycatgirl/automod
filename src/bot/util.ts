import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import { User } from "@janderedev/revolt.js/dist/maps/Users";
import { client } from "..";
import Infraction from "../struct/antispam/Infraction";
import ServerConfig from "../struct/ServerConfig";
import FormData from 'form-data';
import axios from 'axios';
import { Server } from "@janderedev/revolt.js/dist/maps/Servers";

let ServerPermissions = {
    ['View' as string]: 1 << 0,
    ['ManageRoles' as string]: 1 << 1,
    ['ManageChannels' as string]: 1 << 2,
    ['ManageServer' as string]: 1 << 3,
    ['KickMembers' as string]: 1 << 4,
    ['BanMembers' as string]: 1 << 5,
    ['ChangeNickname' as string]: 1 << 12,
    ['ManageNicknames' as string]: 1 << 13,
    ['ChangeAvatar' as string]: 1 << 14,
    ['RemoveAvatars' as string]: 1 << 15,
}

const NO_MANAGER_MSG = '🔒 Missing permission';
const ULID_REGEX = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/i;
const USER_MENTION_REGEX = /^<@[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
const CHANNEL_MENTION_REGEX = /^<#[0-9A-HJ-KM-NP-TV-Z]{26}>$/i;
let autumn_url: string|null = null;
let apiConfig: any = axios.get(client.apiURL).then(res => {
    autumn_url = (res.data as any).features.autumn.url;
});

async function getAutumnURL() {
    return autumn_url || ((await axios.get(client.apiURL)).data as any).features.autumn.url;
}

/**
 * Parses user input and returns an user object.
 * Supports: `userID`, `<@userID>` (mention), `username`, `@username` (if user is cached).
 * @param text
 * @returns null if not found, otherwise user object
 */
async function parseUser(text: string): Promise<User|null> {
    if (!text) return null;

    let uid: string|null = null;
    if (USER_MENTION_REGEX.test(text)) {
        uid = text.replace(/<@|>/g, '').toUpperCase();
    } else if (/^[0-9A-HJ-KM-NP-TV-Z]{26}$/gi.test(text)) {
        uid = text.toUpperCase();
    } else {
        if (text.startsWith('@')) text = text.substr(1);

        // Why is there no .find() or .filter()
        let user: User|null = null;
        client.users.forEach(u => {
            if (u.username?.toLowerCase() == text.toLowerCase()) {
                user = u;
            }
        });

        if (user) return user;
    }

    try {
        if (uid) return await client.users.fetch(uid) || null;
        else return null;
    } catch(e) { return null; }
}

/**
 * Does the exact same as `parseUser`, but returns only `_id` instead
 * of null if the user was not found and the input is also an ID
 */
async function parseUserOrId(text: string): Promise<User|{_id: string}|null> {
    let parsed = await parseUser(text);
    if (parsed) return parsed;
    if (ULID_REGEX.test(text)) return { _id: text.toUpperCase() };
    return null;
}

async function isModerator(member: Member, server: Server) {
    return hasPerm(member, 'KickMembers')
        || await isBotManager(member, server)
        || (((await client.db.get('servers').findOne({ id: server._id }) || {}) as ServerConfig)
        .moderators?.indexOf(member.user?._id!) ?? -1) > -1;
}
async function isBotManager(member: Member, server: Server) {
    return hasPerm(member, 'ManageServer')
        || (((await client.db.get('servers').findOne({ id: server._id }) || {}) as ServerConfig)
        .botManagers?.indexOf(member.user?._id!) ?? -1) > -1;
}

function hasPerm(member: Member, perm:  'View'|'ManageRoles'|'ManageChannels'|'ManageServer'|  // its late and im tired
                                        'KickMembers'|'BanMembers'|'ChangeNickname'|           // dont judge my code
                                        'ManageNicknames'|'ChangeAvatar'|'RemoveAvatars'): boolean {
    let p = ServerPermissions[perm];
    if (member.server?.owner == member.user?._id) return true;

    // this should work but im not 100% certain
    let userPerm = member.roles?.map(id => member.server?.roles?.[id]?.permissions?.[0])
        .reduce((sum?: number, cur?: number) => sum! | cur!, member.server?.default_permissions[0]) ?? 0;

    return !!(userPerm & p);
}

async function storeInfraction(infraction: Infraction): Promise<{ userWarnCount: number }> {
    let collection = client.db.get('infractions');
    let p = [
        collection.insert(infraction, { castIds: false }),
        collection.find({
            server: infraction.server,
            user: infraction.user,
            _id: { $not: { $eq: infraction._id } } },
        ),
    ];

    let r = await Promise.all(p);

    return { userWarnCount: (r[1].length ?? 0) + 1 }
}

async function uploadFile(file: any, filename: string): Promise<string> {
    let data = new FormData();
    data.append("file", file, { filename: filename });

    let req = await axios.post(await getAutumnURL() + '/attachments', data, { headers: data.getHeaders() });
    return (req.data as any)['id'] as string;
}

/**
 * Attempts to escape a message's markdown content (qoutes, headers, **bold** / *italic*, etc)
 */
function sanitizeMessageContent(msg: string): string {
    let str = '';
    for (let line of msg.split('\n')) {

        line = line.trim();

        if (line.startsWith('#')  || // headers
            line.startsWith('>')  || // quotes
            line.startsWith('|')  || // tables
            line.startsWith('*')  || // unordered lists
            line.startsWith('-')  || // ^
            line.startsWith('+')     // ^
        ) {
            line = `\\${line}`;
        }

        // Ordered lists can't be escaped using `\`,
        // so we just put an invisible character \u200b
        if (/^[0-9]+[)\.].*/gi.test(line)) {
            line = `\u200b${line}`;
        }

        for (const char of ['_', '!!', '~', '`', '*', '^', '$']) {
            line = line.replace(new RegExp(`(?<!\\\\)\\${char}`, 'g'), `\\${char}`);
        }

        // Mentions
        line = line.replace(/<@/g, `<\\@`);

        str += line + '\n';
    }

    return str;
}

export {
    getAutumnURL,
    hasPerm,
    isModerator,
    isBotManager,
    parseUser,
    parseUserOrId,
    storeInfraction,
    uploadFile,
    sanitizeMessageContent,
    NO_MANAGER_MSG,
    ULID_REGEX,
    USER_MENTION_REGEX,
    CHANNEL_MENTION_REGEX,
}
