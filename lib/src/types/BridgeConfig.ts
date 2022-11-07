import { CONFIG_KEYS } from "../misc/bridge_config_keys";

export default class {
    // Revolt channel ID
    revolt?: string;

    // Discord channel ID
    discord?: string;

    // Discord webhook
    discordWebhook?: {
        id: string;
        token: string;
    };

    config?: { [key in keyof typeof CONFIG_KEYS]: boolean | undefined };

    /**
     * @deprecated Use config.disallow_opt_out
     * Will be automatically removed by database migrations
     */
    disallowIfOptedOut?: boolean;
}
