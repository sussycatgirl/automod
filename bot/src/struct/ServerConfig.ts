import AutomodSettings from "./antispam/AutomodSettings";
import LogConfig from "./LogConfig";

class ServerConfig {
    id: string;
    prefix?: string;
    spaceAfterPrefix?: boolean;
    automodSettings?: AutomodSettings;
    botManagers?: string[];
    moderators?: string[];
    votekick?: {
        enabled: boolean;
        votesRequired: number;
        banDuration: number;    // -1: Only kick, 0: Permanent, >0: Ban duration in minutes
        trustedRoles: string[];
    };
    linkedServer?: string;
    whitelist?: {
        users?: string[],
        roles?: string[],
        managers?: boolean,
    };
    logs?: {
        messageUpdate?: LogConfig,  // Message edited or deleted
        modAction?: LogConfig,      // User warned, kicked or banned
    };
    allowBlacklistedUsers?: boolean; // Whether the server explicitly allows users that are globally blacklisted
}

export default ServerConfig;
