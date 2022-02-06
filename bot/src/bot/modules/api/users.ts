import { User } from "@janderedev/revolt.js/dist/maps/Users";
import { client } from "../../..";
import { getPermissionLevel, parseUser } from "../../util";
import { wsEvents, WSResponse } from "../api_communication";
import { APIUser } from "./server_details";

wsEvents.on('req:getPermissionLevel', async (data: { user: string, server: string }, cb: (data: WSResponse) => void) => {
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

        return cb({ success: true, level: await getPermissionLevel(user, server) })
    } catch(e) {
        console.error(e);
        cb({ success: false, error: `${e}` });
    }
});

wsEvents.on('req:getUser', async (data: { user: string }, cb: (data: WSResponse) => void) => {
    try {
        const user = await parseUser(data.user);
        if (!user)
            cb({ success: false, statusCode: 404, error: 'User could not be found' });
        else
            cb({ success: true, user: { id: user._id, username: user.username, avatarURL: user.generateAvatarURL() } as APIUser });
    } catch(e) {
        console.error(e);
        cb({ success: false, error: `${e}` });
    }
});
