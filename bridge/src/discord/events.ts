import { BRIDGED_MESSAGES, BRIDGE_CONFIG, logger } from "..";
import { client } from "./client";
import { client as revoltClient } from "../revolt/client";
import { ChannelPermission } from "@janderedev/revolt.js";
import axios from 'axios';
import BridgedMessage from "../types/BridgedMessage";

client.on('messageCreate', async message => {
    try {
        logger.debug(`[M] Discord: ${message.content}`);

        const bridgeCfg = await BRIDGE_CONFIG.findOne({ discord: message.channelId });
        if (!bridgeCfg?.revolt) return logger.debug(`Discord: No Revolt channel associated`);

        const channel = revoltClient.channels.get(bridgeCfg.revolt);
        if (!channel) return logger.debug(`Discord: Cannot find associated channel`);

        if (!(channel.permission & ChannelPermission.SendMessage)) {
            return logger.debug(`Discord: Lacking SendMessage permission; refusing to send`);
        }

        if (!(channel.permission & ChannelPermission.Masquerade)) {
            return logger.debug(`Discord: Lacking Masquerade permission; refusing to send`);
        }

        await axios.post(
            `${revoltClient.apiURL}/channels/${channel._id}/messages`,
            {
                content: message.content, // todo: parse and normalize this
                //attachments: [],
                //embeds: [],
                //replies: [],
                masquerade: {
                    name: message.author.username,
                    avatar: message.author.displayAvatarURL({ size: 128 }),
                }
            },
            {
                headers: {
                    'x-bot-token': process.env['REVOLT_TOKEN']!
                }
            }
        )
        .then(async res => {
            await BRIDGED_MESSAGES.insert({
                origin: 'discord',
                discord: {
                    messageId: message.id,
                },
                revolt: {
                    messageId: res.data._id,
                },
            } as BridgedMessage);
        })
        .catch(e => {
            console.error(`Failed to send message`, e.response.data)
        });
    } catch(e) {
        console.error(e);
    }
});
