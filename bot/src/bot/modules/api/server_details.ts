import { Member } from "revolt.js/dist/maps/Members";
import { User } from "revolt.js/dist/maps/Users";
import { client } from "../../..";
import AutomodSettings from "../../../struct/antispam/AutomodSettings";
import ServerConfig from "../../../struct/ServerConfig";
import { getPermissionLevel } from "../../util";
import { wsEvents, WSResponse } from "../api_communication";

type ReqData = { user: string, server: string }

type ServerDetails = {
    id: string,
    perms: 0|1|2,
    name: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig?: ServerConfig,
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

        const response: ServerDetails = {
            id: server._id,
            name: server.name,
            perms: await getPermissionLevel(member, server),
            description: server.description ?? undefined,
            bannerURL: server.generateBannerURL(),
            iconURL: server.generateIconURL(),
            serverConfig,
        }

        cb({ success: true, server: response });
    } catch(e) {
        console.error(e);
        cb({ success: false, error: `${e}` });
    }
});
