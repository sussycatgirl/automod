export default class LogConfig {
    revolt?: {
        channel?: string,

        // EMBED uses Revolt's embeds.
        // PLAIN is like QUOTEBLOCK but without the quotes.
        type?: 'EMBED'|'QUOTEBLOCK'|'PLAIN';
    }
    discord?: {
        webhookUrl?: string,
    }
}
