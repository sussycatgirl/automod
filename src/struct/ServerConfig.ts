import AutomodSettings from "./antispam/AutomodSettings";

class ServerConfig {
    id: string | undefined;
    prefix: string | undefined;
    spaceAfterPrefix: boolean | undefined;
    automodSettings: AutomodSettings | undefined;
    botManagers: string[] | undefined;
    moderators: string[] | undefined;
    whitelist: {
        users: string[] | undefined,
        roles: string[] | undefined,
        managers: boolean | undefined,
    } | undefined;
    logs: {
        infractions: string | undefined,    // User warned
        automod: string | undefined,        // automod rule triggered
        messageUpdate: string | undefined,  // Message edited or deleted
        modAction: string | undefined,      // User kicked, banned, or roles updated
        userUpdate: string | undefined,     // Username/nickname/avatar changes
    } | undefined;
}

export default ServerConfig;
