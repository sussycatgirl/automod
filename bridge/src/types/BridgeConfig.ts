import { CONFIG_KEYS } from "./ConfigKeys";

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

    // If true, messages by users who have opted out of bridging will be deleted.
    disallowIfOptedOut?: boolean;
}
