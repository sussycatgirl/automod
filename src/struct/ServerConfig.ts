import AutomodSettings from "./antispam/AutomodSettings";

class ServerConfig {
    id: string | undefined;
    prefix: string | undefined;
    spaceAfterPrefix: boolean | undefined;
    automodSettings: AutomodSettings | undefined;
    botManagers: string[] | undefined;
}

export default ServerConfig;
