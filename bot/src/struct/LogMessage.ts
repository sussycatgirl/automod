type Override = {
    description?: string|null;
};

export default class LogMessage {
    title: string;
    description?: string;
    fields?: { title: string, content: string, inline?: boolean }[];
    color?: string;
    image?: { type: 'BIG'|'THUMBNAIL', url: string };
    attachments?: { name: string, content: Buffer }[];
    overrides?: {
        // These take priority over `revolt`
        revoltEmbed?: Override,
        revoltQuoteblock?: Override,

        revolt?: Override,

        discord?: Override,
    }
}