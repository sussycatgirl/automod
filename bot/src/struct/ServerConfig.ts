import AutomodSettings from "./antispam/AutomodSettings";
import LogConfig from "./LogConfig";

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
        messageUpdate?: LogConfig,  // Message edited or deleted
        modAction?: LogConfig,      // User warned, kicked or banned
        userScan?: LogConfig        // User profile matched word list
    } | undefined;
    enableUserScan?: boolean;
}

export default ServerConfig;
