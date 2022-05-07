import { MessageEmbed } from "discord.js"
import { SendableEmbed } from "revolt-api";

export default class GenericEmbed {
    constructor(embed?: MessageEmbed|SendableEmbed) {
        if (embed instanceof MessageEmbed) {
            if (embed.title) this.title = embed.title;
            else if (embed.author?.name) this.title = embed.author.name;

            if (embed.url) this.url = embed.url;
            else if (embed.author?.url) this.url = embed.author.url;

            if (this.title && embed.author?.iconURL) this.icon = embed.author.iconURL;

            if (embed.description) this.description = embed.description;

            if (embed.hexColor) this.color = `${embed.hexColor}`;
        } else if (embed) {
            if (embed.title) this.title = embed.title;
            if (embed.description) this.description = embed.description;
            if (embed.icon_url?.match(/^http(s)?\:\/\//)) this.icon = embed.icon_url;
            if (embed.colour) this.color = (embed.colour as any);
            if (embed.url) this.url = embed.url;
        }
    }

    // Embed title. Set to the author name on Discord for consistency
    title?: string;

    // Embed description
    description?: string;

    // Displayed as the author icon on Discord and next to the title on Revolt
    icon?: string;

    // Not sure how this works on Revolt
    url?: string;

    // Embed color
    color?: `#${string}`;

    toDiscord = (): MessageEmbed => {
        const embed = new MessageEmbed();

        if (this.description) embed.setDescription(this.description);
        if (this.title) embed.setAuthor({ name: this.title, iconURL: this.icon, url: this.url });
        if (this.color) embed.setColor(this.color);

        return embed;
    }

    toRevolt = (): SendableEmbed => {
        const embed: SendableEmbed = {}

        embed.title = this.title;
        embed.description = this.description;
        embed.icon_url = this.icon;
        embed.url = this.url;
        embed.colour = this.color?.toString();

        // todo: embed.media needs to be an autumn url. we might
        // want to download and reupload the attachment.

        return embed;
    }
}