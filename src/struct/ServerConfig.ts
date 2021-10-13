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
}

export default ServerConfig;
