import { Message } from "@janderedev/revolt.js";
import { ulid } from "ulid";
import { SendableEmbed } from "revolt-api";
import { CONFIG_KEYS } from "automod/dist/misc/bridge_config_keys";
import { dbs } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { DEFAULT_PREFIX } from "../../modules/command_handler";
import {
    embed,
    EmbedColor,
    isBotManager,
    isModerator,
    NO_MANAGER_MSG,
} from "../../util";

const DISCORD_INVITE_URL =
    "https://discord.com/api/oauth2/authorize?client_id=965692929643524136&permissions=536996864&scope=bot%20applications.commands"; // todo: read this from env or smth

export default {
    name: "bridge",
    aliases: null,
    description: "Bridge a channel with Discord",
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        switch (args[0]?.toLowerCase()) {
            case "link": {
                if (!(await isBotManager(message)))
                    return message.reply(NO_MANAGER_MSG);

                const count = await dbs.BRIDGE_CONFIG.count({
                    revolt: message.channel_id,
                });
                if (count)
                    return message.reply(`This channel is already bridged.`);

                // Invalidate previous bridge request
                await dbs.BRIDGE_REQUESTS.remove({
                    revolt: message.channel_id,
                });

                const reqId = ulid();
                await dbs.BRIDGE_REQUESTS.insert({
                    id: reqId,
                    revolt: message.channel_id,
                    expires: Date.now() + 1000 * 60 * 15,
                });

                let text =
                    `### Link request created.\n` +
                    `Request ID: \`${reqId}\`\n\n` +
                    `[Invite the bridge bot to your Discord server](<${DISCORD_INVITE_URL}>) ` +
                    `and run \`/bridge confirm ${reqId}\` in the channel you wish to link.\n` +
                    `This request expires in 15 minutes.`;

                if (
                    !message.channel!.havePermission("Masquerade") ||
                    !message.channel!.havePermission("SendEmbeds") ||
                    !message.channel!.havePermission("UploadFiles")
                ) {
                    text +=
                        "\n\n> :warning: I currently don't have all required permissions in this " +
                        'channel for the bridge to work. Please make sure to grant the "Masquerade", ' +
                        '"Upload Files" and "Send Embeds" permission.';
                }

                await message.reply(text, false);

                break;
            }
            case "unlink": {
                if (!(await isBotManager(message)))
                    return message.reply(NO_MANAGER_MSG);

                const res = await dbs.BRIDGE_CONFIG.remove({
                    revolt: message.channel_id,
                });
                if (res.deletedCount) await message.reply(`Channel unlinked!`);
                else
                    await message.reply(`Unable to unlink; no channel linked.`);
                break;
            }
            case "unlink_all": {
                if (!(await isBotManager(message)))
                    return message.reply(NO_MANAGER_MSG);

                const query = {
                    revolt: { $in: message.channel?.server?.channel_ids || [] },
                };
                if (args[1] == "CONFIRM") {
                    const res = await dbs.BRIDGE_CONFIG.remove(query);
                    if (res.deletedCount) {
                        await message.reply(
                            `All channels have been unlinked. (Count: **${res.deletedCount}**)`
                        );
                    } else {
                        await message.reply(
                            `No bridged channels found; nothing to delete.`
                        );
                    }
                } else {
                    const res = await dbs.BRIDGE_CONFIG.count(query);
                    if (!res)
                        await message.reply(
                            `No bridged channels found; nothing to delete.`
                        );
                    else {
                        await message.reply(
                            `${res} bridged channels found. ` +
                                `Run \`${DEFAULT_PREFIX}bridge unlink_all CONFIRM\` to confirm deletion.`
                        );
                    }
                }
                break;
            }
            case "list": {
                if (!(await isBotManager(message)))
                    return message.reply(NO_MANAGER_MSG);

                const links = await dbs.BRIDGE_CONFIG.find({
                    revolt: { $in: message.channel?.server?.channel_ids || [] },
                });

                await message.reply({
                    content: "#",
                    embeds: [
                        {
                            title: `Bridges in ${message.channel?.server?.name}`,
                            description:
                                `**${links.length}** bridged channels found.\n\n` +
                                links
                                    .map(
                                        (l) =>
                                            `<#${l.revolt}> **->** ${l.discord}`
                                    )
                                    .join("\n"),
                        },
                    ],
                });
                break;
            }
            case "info": {
                try {
                    if (!message.reply_ids) {
                        return await message.reply(
                            "Please run this command again while replying to a message."
                        );
                    }

                    if (
                        message.reply_ids.length > 1 &&
                        !(await isModerator(message, false))
                    ) {
                        return await message.reply(
                            "To avoid spam, only moderators are allowed to query bridge info for more than one message at a time."
                        );
                    }

                    const messages = (
                        await Promise.allSettled(
                            message.reply_ids?.map((m) =>
                                message.channel!.fetchMessage(m)
                            ) || []
                        )
                    )
                        .filter((m) => m.status == "fulfilled")
                        .map(
                            (m) => (m as PromiseFulfilledResult<Message>).value
                        );

                    if (!messages.length) {
                        return await message.reply(
                            "Something went wrong; could not fetch the target message(s)."
                        );
                    }

                    const embeds: SendableEmbed[] = await Promise.all(
                        messages.map(async (msg) => {
                            const bridgeData =
                                await dbs.BRIDGED_MESSAGES.findOne({
                                    "revolt.messageId": msg._id,
                                });

                            const embed: SendableEmbed = bridgeData
                                ? {
                                      url: msg.url,
                                      title: `Message ${
                                          bridgeData?.origin == "revolt"
                                              ? `by ${msg.author?.username}`
                                              : "from Discord"
                                      }`,
                                      colour: "#7e96ff",
                                      description:
                                          `**Origin:** ${
                                              bridgeData.origin == "revolt"
                                                  ? "Revolt"
                                                  : "Discord"
                                          }\n` +
                                          `**Bridge Status:** ${
                                              bridgeData.origin == "revolt"
                                                  ? bridgeData.discord.messageId
                                                      ? "Bridged"
                                                      : "Unbridged"
                                                  : bridgeData.revolt.messageId
                                                  ? "Bridged"
                                                  : bridgeData.revolt.nonce
                                                  ? "ID unknown"
                                                  : "Unbridged"
                                          }\n` +
                                          `### Bridge Data\n` +
                                          `Origin: \`${bridgeData.origin}\`\n` +
                                          `Discord ID: \`${bridgeData.discord.messageId}\`\n` +
                                          `Revolt ID: \`${bridgeData.revolt.messageId}\`\n` +
                                          `Revolt Nonce: \`${bridgeData.revolt.nonce}\`\n` +
                                          `Discord Channel: \`${bridgeData.channels?.discord}\`\n` +
                                          `Revolt Channel: \`${bridgeData.channels?.revolt}\``,
                                  }
                                : {
                                      url: msg.url,
                                      title: `Message by ${msg.author?.username}`,
                                      description:
                                          "This message has not been bridged.",
                                      colour: "#7e96ff",
                                  };

                            return embed;
                        })
                    );

                    await message.reply({ embeds }, false);
                } catch (e) {
                    console.error(e);
                    message.reply("" + e)?.catch(() => {});
                }
                break;
            }
            case "status": {
                const link = await dbs.BRIDGE_CONFIG.findOne({
                    revolt: message.channel_id,
                });

                if (!link)
                    return await message.reply({
                        embeds: [
                            embed(
                                "This channel is **not** bridged, and no message data is being sent to Discord.",
                                "Bridge status",
                                EmbedColor.Success
                            ),
                        ],
                    });
                else
                    return await message.reply({
                        embeds: [
                            embed(
                                "This channel is bridged to Discord. Please refer to the [Privacy Policy](<https://github.com/janderedev/automod/wiki/Privacy-Policy>) for more info.",
                                "Bridge Status",
                                EmbedColor.Success
                            ),
                        ],
                    });
            }
            case "config": {
                const [_, configKey, newVal]: (string | undefined)[] = args;

                if (!configKey) {
                    return await message.reply({
                        embeds: [
                            {
                                title: "Bridge Configuration",
                                description:
                                    `To modify a configuration option, run ${DEFAULT_PREFIX}bridge config <key> [true|false].\n\n` +
                                    `**Available configuration keys:**` +
                                    Object.keys(CONFIG_KEYS).map(
                                        (key) => `\n- ${key}`
                                    ),
                            },
                        ],
                    });
                }

                if (!Object.keys(CONFIG_KEYS).includes(configKey)) {
                    return await message.reply("Unknown configuration key.");
                }

                const key = CONFIG_KEYS[configKey as keyof typeof CONFIG_KEYS];

                if (!newVal) {
                    const bridgeConfig = await dbs.BRIDGE_CONFIG.findOne({
                        revolt: message.channel_id,
                    });
                    return await message.reply({
                        embeds: [
                            {
                                title: "Bridge Configuration: " + configKey,
                                description: `**${key.friendlyName}**\n${
                                    key.description
                                }\n\nCurrent value: **${
                                    bridgeConfig?.config?.[
                                        configKey as keyof typeof CONFIG_KEYS
                                    ]
                                }**`,
                            },
                        ],
                    });
                }

                if (newVal != "true" && newVal != "false") {
                    return await message.reply(
                        "Value needs to be either `true` or `false`."
                    );
                }

                await dbs.BRIDGE_CONFIG.update(
                    { revolt: message.channel_id },
                    {
                        $set: { [`config.${configKey}`]: newVal == "true" },
                        $setOnInsert: { revolt: message.channel_id },
                    },
                    { upsert: true }
                );
                return await message.reply(
                    `Configuration key **${configKey}** has been updated to **${newVal}**.`
                );
            }
            case "help": {
                await message.reply({
                    content: "#",
                    embeds: [
                        {
                            title: "Discord Bridge",
                            description:
                                `Bridges allow you to link your Revolt server to a Discord server ` +
                                `by relaying all messages.\n\n` +
                                `To link a channel, first run \`${DEFAULT_PREFIX}bridge link\` on Revolt. ` +
                                `This will provide you with a link ID.\n` +
                                `On Discord, first [add the Bridge bot to your server](<${DISCORD_INVITE_URL}>), ` +
                                `then run the command: \`/bridge confirm [ID]\`.\n\n` +
                                `You can list all bridges in a Revolt server by running \`${DEFAULT_PREFIX}bridge list\`\n\n` +
                                `To unlink a channel, run \`/bridge unlink\` from either Discord or Revolt. If you wish to ` +
                                `unbridge all channels in a Revolt server, run \`${DEFAULT_PREFIX}bridge unlink_all\`.\n` +
                                `To view bridge info about a particular message, run \`${DEFAULT_PREFIX}bridge info\` ` +
                                `while replying to the message.\n` +
                                `You can customize how the bridge behaves using \`${DEFAULT_PREFIX}bridge config\`.`,
                        },
                    ],
                });
                break;
            }
            default: {
                await message.reply(
                    `Run \`${DEFAULT_PREFIX}bridge help\` for help.`
                );
            }
        }
    },
} as SimpleCommand;
