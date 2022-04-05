export default class {
    origin: 'discord'|'revolt';

    discord: {
        messageId?: string;
    }

    revolt: {
        messageId?: string;
        nonce?: string;
    }
}
