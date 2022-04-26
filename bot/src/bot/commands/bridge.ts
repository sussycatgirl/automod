import { ulid } from "ulid";
import { dbs } from "../..";
import CommandCategory from "../../struct/commands/CommandCategory";
import SimpleCommand from "../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../struct/MessageCommandContext";
import { DEFAULT_PREFIX } from "../modules/command_handler";
import { isBotManager, NO_MANAGER_MSG } from "../util";

const DISCORD_INVITE_URL = 'https://discord.com/api/oauth2/authorize?client_id=965692929643524136&permissions=536996864&scope=bot%20applications.commands'; // todo: read this from env or smth

export default {
    name: 'bridge',
    aliases: null,
    description: 'Bridge a channel with Discord',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (!await isBotManager(message)) return message.reply(NO_MANAGER_MSG);

        switch(args[0]?.toLowerCase()) {
            case 'link': {
                const count = await dbs.BRIDGE_CONFIG.count({ revolt: message.channel_id });
                if (count) return message.reply(`This channel is already bridged.`);

                // Invalidate previous bridge request
                await dbs.BRIDGE_REQUESTS.remove({ revolt: message.channel_id });

                const reqId = ulid();
                await dbs.BRIDGE_REQUESTS.insert({
                    id: reqId,
                    revolt: message.channel_id,
                    expires: Date.now() + (1000 * 60 * 15),
                });

                await message.reply(`### Link request created.\n`
                    + `Request ID: \`${reqId}\`\n\n`
                    + `[Invite the bridge bot to your Discord server](<${DISCORD_INVITE_URL}>) `
                    + `and run \`/bridge confirm ${reqId}\` in the channel you wish to link.\n`
                    + `This request expires in 15 minutes.`);

                break;
            }
            case 'unlink': {
                const res = await dbs.BRIDGE_CONFIG.remove({ revolt: message.channel_id });
                if (res.deletedCount) await message.reply(`Channel unlinked!`);
                else await message.reply(`Unable to unlink; no channel linked.`);
                break;
            }
            case 'unlink_all': {
                const query = { revolt: { $in: message.channel?.server?.channel_ids || [] } };
                if (args[1] == 'CONFIRM') {
                    const res = await dbs.BRIDGE_CONFIG.remove(query);
                    if (res.deletedCount) {
                        await message.reply(`All channels have been unlinked. (Count: **${res.deletedCount}**)`);
                    } else {
                        await message.reply(`No bridged channels found; nothing to delete.`);
                    }
                } else {
                    const res = await dbs.BRIDGE_CONFIG.count(query);
                    if (!res) await message.reply(`No bridged channels found; nothing to delete.`);
                    else {
                        await message.reply(`${res} bridged channels found. `
                            + `Run \`${DEFAULT_PREFIX}bridge unlink_all CONFIRM\` to confirm deletion.`);
                    }
                }
                break;
            }
            case 'list': {
                const links = await dbs.BRIDGE_CONFIG.find({ revolt: { $in: message.channel?.server?.channel_ids || [] } });

                await message.reply({
                    content: '#',
                    embeds: [
                        {
                            type: 'Text',
                            title: `Bridges in ${message.channel?.server?.name}`,
                            description: `**${links.length}** bridged channels found.\n\n`
                                + links.map(l => `<#${l.revolt}> **->** ${l.discord}`).join('\n'),
                        }
                    ]
                });
                break;
            }
            case 'help': {
                await message.reply({
                    content: '#',
                    embeds: [
                        {
                            type: 'Text',
                            title: 'Discord Bridge',
                            description: `Bridges allow you to link your Revolt server to a Discord server `
                                + `by relaying all messages.\n\n`
                                + `To link a channel, first run \`${DEFAULT_PREFIX}bridge link\` on Revolt. `
                                + `This will provide you with a link ID.\n`
                                + `On Discord, first [add the Bridge bot to your server](<${DISCORD_INVITE_URL}>), `
                                + `then run the command: \`/bridge confirm [ID]\`.\n\n`
                                + `You can list all bridges in a Revolt server by running \`${DEFAULT_PREFIX}bridge list\`\n\n`
                                + `To unlink a channel, run \`/bridge unlink\` from either Discord or Revolt. If you wish to `
                                + `unbridge all channels in a Revolt server, run \`${DEFAULT_PREFIX}bridge unlink_all\`.`
                        }
                    ]
                });
                break;
            }
            default: {
                await message.reply(`Run \`${DEFAULT_PREFIX}bridge help\` for help.`);
            }
        }
    }
} as SimpleCommand;
