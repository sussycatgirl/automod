import Command from "../../struct/Command";
import { Message } from "@janderedev/revolt.js/dist/maps/Messages";
import { client } from "../..";
import AutomodSettings from "../../struct/antispam/AutomodSettings";
import AntispamRule from "../../struct/antispam/AntispamRule";
import ModerationAction from "../../struct/antispam/ModerationAction";
import { isBotManager, NO_MANAGER_MSG } from "../util";
import { ulid } from 'ulid';

export default {
    name: 'settings',
    aliases: [ 'setting' ],
    description: 'change antispam settings',
    run: async (message: Message, args: string[]) => {
        if (!isBotManager(message.member!)) return message.reply(NO_MANAGER_MSG);

        let settings = {
            spam: [
                {
                    id: ulid(),
                    max_msg: 5,
                    timeframe: 3,
                    action: ModerationAction.Delete,
                    channels: null,
                } as AntispamRule,
                {
                    id: ulid(),
                    max_msg: 4,
                    timeframe: 3,
                    action: ModerationAction.Warn,
                    channels: null,
                } as AntispamRule
            ]
        } as AutomodSettings;

        client.db.get('servers')
            .update({ id: message.channel?.server_id }, { $set: { automodSettings: settings } });

        message.reply('Default config restored');
    }
} as Command;
