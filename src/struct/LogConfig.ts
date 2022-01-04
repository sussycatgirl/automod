export default class LogConfig {
    revolt?: {
        channel?: string,

        // RVEMBED uses https://rvembed.janderedev.xyz to send a discord style embed, which doesn't
        // work properly with longer messages.
        // PLAIN is like QUOTEBLOCK but without the quotes.
        // DYNAMIC uses RVEMBED if the message is short enough, otherwise defaults to QUOTEBLOCK.
        type?: 'QUOTEBLOCK'|'PLAIN'|'RVEMBED'|'DYNAMIC';
    }
    discord?: {
        webhookUrl?: string,
    }
}
