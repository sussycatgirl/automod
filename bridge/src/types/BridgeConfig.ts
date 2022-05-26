export default class {
    // Revolt channel ID
    revolt?: string;

    // Discord channel ID
    discord?: string;

    // Discord webhook
    discordWebhook?: {
        id: string;
        token: string;
    }

    // If true, messages by users who have opted out of bridging will be deleted.
    disallowIfOptedOut?: boolean;
}
