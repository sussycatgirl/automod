import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";

export default {
    name: 'settings',
    aliases: [ 'setting' ],
    description: 'Manage AutoMod\'s configuration',
    category: CommandCategory.Config,
    run: async (message: MessageCommandContext, args: string[]) => {
        await message.reply(`Bot configuration can be managed from `
            + `[here](<${process.env.WEB_UI_URL || 'https://automod.janderedev.xyz'}/dashboard>).`);
    }
} as SimpleCommand;
