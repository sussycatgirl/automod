import { Member } from "@janderedev/revolt.js/dist/maps/Members";
import { User } from "@janderedev/revolt.js/dist/maps/Users";
import { client } from "../../..";
import ServerConfig from "../../../struct/ServerConfig";
import { getPermissionLevel } from "../../util";
import { wsEvents, WSResponse } from "../api_communication";

type ReqData = { user: string, server: string }
type APIUser = { id: string, username?: string, avatarURL?: string }
type APIChannel = { id: string, name: string, icon?: string, type: 'VOICE'|'TEXT', nsfw: boolean }

type ServerDetails = {
    id: string,
    perms: 0|1|2|3,
    name: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig?: ServerConfig,
    users: APIUser[],
    channels: APIChannel[],
    roles: {
        id: string,
        name: string,
        color?: string,
        rank?: number,
        perms: {
            server: number,
            channel: number,
        }
    }[],
}

wsEvents.on('req:getUserServerDetails', async (data: ReqData, cb: (data: WSResponse) => void) => {
    try {
        const server = client.servers.get(data.server);
        if (!server) return cb({ success: false, error: 'The requested server could not be found', statusCode: 404 });

        let user: User;
        try {
            user = client.users.get(data.user) || await client.users.fetch(data.user);
        } catch(e) {
            cb({ success: false, error: 'The requested user could not be found', statusCode: 404 });
            return;
        }

        let member: Member;
        try {
            member = await server.fetchMember(user);
        } catch(e) {
            cb({ success: false, error: 'The requested user is not a member of that server', statusCode: 401 });
            return;
        }

        const serverConfig: ServerConfig = await client.db.get('servers').findOne({ id: server._id });

        // todo: remove unwanted keys from server config

        async function fetchUser(id: string) {
            try {
                return client.users.get(id) || await client.users.fetch(id);
            } catch(e) {
                throw id; // this is stupid but idc
            }
        }

        const users = await Promise.allSettled([
            ...(serverConfig.botManagers?.map(u => fetchUser(u)) ?? []),
            ...(serverConfig.moderators?.map(u => fetchUser(u)) ?? []),
            fetchUser(user._id),
        ]);

        const response: ServerDetails = {
            id: server._id,
            name: server.name,
            perms: await getPermissionLevel(member, server),
            description: server.description ?? undefined,
            bannerURL: server.generateBannerURL(),
            iconURL: server.generateIconURL(),
            serverConfig,
            users: users.map(
                u => u.status == 'fulfilled'
                    ? { id: u.value._id, avatarURL: u.value.generateAvatarURL(), username: u.value.username }
                    : { id: u.reason }
            ),
            channels: server.channels.filter(c => c != undefined).map(c => ({
                id: c!._id,
                name: c!.name ?? '',
                nsfw: c!.nsfw ?? false,
                type: c!.channel_type == 'VoiceChannel' ? 'VOICE' : 'TEXT',
                icon: c!.generateIconURL(),
            })),
            roles: server.roles
                ? Object.entries(server.roles).map(r => ({
                    id: r[0],
                    name: r[1].name,
                    color: r[1].colour,
                    rank: r[1].rank,
                    perms: {
                        server: r[1].permissions[0],
                        channel: r[1].permissions[1],
                    },
                }))
                : [],
        }

        cb({ success: true, server: response });
    } catch(e) {
        console.error(e);
        cb({ success: false, error: `${e}` });
    }
});

export { APIUser }
