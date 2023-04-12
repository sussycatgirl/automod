import { ColorResolvable, MessageEmbed, WebhookClient } from "discord.js";
import logger from "./logger";
import { client as bot } from '../index'

let client: WebhookClient|undefined;

if (process.env.LOG_WEBHOOK) {
    try {
        client = new WebhookClient({ url: process.env.LOG_WEBHOOK });
    } catch(e) {
        console.error(e);
    }
}

async function adminBotLog(data: { message: string, type: 'INFO'|'WARN'|'ERROR' }) {
    logger.info(`[${data.type}] Admin log: ${data.message}`);
    try {
        let color: ColorResolvable = '#ffffff';
        switch(data.type) {
            case 'INFO': color = '#00ff73'; break;
            case 'WARN': color = '#ffc823'; break;
            case 'ERROR': color = '#ff4208'; break;
        }

        let embed = new MessageEmbed()
            .setDescription(data.message)
            .setColor(color);

        await client?.send({
            embeds: [ embed ],
            username: bot.user?.username,
            avatarURL: bot.user?.avatarURL,
        });
    } catch(e) {
        logger.error(`Failed to log: ${e}`);
    }
}

export {
    client,
    adminBotLog,
}
