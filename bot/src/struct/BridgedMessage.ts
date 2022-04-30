export default class {
    origin: 'discord'|'revolt';

    discord: {
        messageId?: string;
    }

    revolt: {
        messageId?: string;
        nonce?: string;
    }

    // Required to sync message deletions
    channels?: {
        discord: string;
        revolt: string;
    }
}
