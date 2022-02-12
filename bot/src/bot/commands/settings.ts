import Command from "../../struct/Command";
import MessageCommandContext from "../../struct/MessageCommandContext";

export default {
    name: 'settings',
    aliases: [ 'setting' ],
    description: 'Manage AutoMod\'s configuration',
    category: 'configuration',
    run: async (message: MessageCommandContext, args: string[]) => {
        await message.reply(`Bot configuration can be managed from `
            + `[here](<${process.env.WEB_UI_URL || 'https://automod.janderedev.xyz'}/dashboard>).`);
    }
} as Command;
