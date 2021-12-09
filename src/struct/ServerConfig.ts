import AutomodSettings from "./antispam/AutomodSettings";

class ServerConfig {
    id: string | undefined;
    prefix: string | undefined;
    spaceAfterPrefix: boolean | undefined;
    automodSettings: AutomodSettings | undefined;
    botManagers: string[] | undefined;
    moderators: string[] | undefined;
    linkedServer: string | undefined;
    whitelist: {
        users: string[] | undefined,
        roles: string[] | undefined,
        managers: boolean | undefined,
    } | undefined;
    logs: {
        automod: string | undefined,        // automod rule triggered
        messageUpdate: string | undefined,  // Message edited or deleted
        modAction: string | undefined,      // User warned, kicked or banned
        userUpdate: string | undefined,     // Username/nickname/avatar changes
    } | undefined;
    userScan: {
        enable?: boolean;
        logChannel?: string;
        discordWebhook?: string;
    } | undefined;
}

export default ServerConfig;
