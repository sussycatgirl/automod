// fuck slash commands

import { client } from "./client";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { BRIDGED_MESSAGES, BRIDGE_CONFIG, BRIDGE_REQUESTS, BRIDGE_USER_CONFIG, logger } from "..";
import { MessageEmbed, TextChannel } from "discord.js";
import { revoltFetchMessage, revoltFetchUser } from "../util";
import { client as revoltClient } from "../revolt/client";
import { CONFIG_KEYS } from "automod/dist/misc/bridge_config_keys";

const PRIVACY_POLICY_URL =
    "https://github.com/janderedev/automod/wiki/Privacy-Policy";

const COMMANDS: any[] = [
    {
        name: "bridge",
        description: "Confirm or delete Revolt bridges",
        type: 1, // Slash command
        options: [
            {
                name: "confirm",
                description: "Confirm a bridge initiated from Revolt",
                type: 1, // Subcommand
                options: [
                    {
                        name: "id",
                        description: "The bridge request ID",
                        required: true,
                        type: 3,
                    },
                ],
            },
            {
                name: "unlink",
                description: "Unbridge the current channel",
                type: 1,
            },
            {
                name: "help",
                description: "Usage instructions",
                type: 1,
            },
            {
                name: "opt_out",
                description: "Opt out of having your messages bridged",
                type: 1,
                options: [
                    {
                        name: "opt_out",
                        description:
                            "Whether you wish to opt out of having your messages bridged",
                        optional: true,
                        type: 5, // Boolean
                    },
                ],
            },
            {
                name: "status",
                description:
                    "Find out whether this channel is bridged to Revolt",
                type: 1,
            },
            {
                name: "config",
                description: "Bridge configuration options for this channel",
                type: 1,
                options: [
                    {
                        name: "key",
                        description: "The configuration option to change",
                        type: 3, // String
                        required: true,
                        choices: Object.entries(CONFIG_KEYS).map((conf) => ({
                            name: conf[1].friendlyName,
                            value: conf[0],
                        })),
                    },
                    {
                        name: "value",
                        description:
                            "The new value for the option. Leave empty to get current state",
                        type: 5, // Boolean
                        required: false,
                    },
                ],
            },
        ],
    },
    {
        name: "Message Info",
        description: "",
        type: 3, // Message context menu
    },
];

const rest = new REST({ version: "9" }).setToken(process.env["DISCORD_TOKEN"]!);

client.once("ready", async () => {
    try {
        logger.info(`Refreshing application commands.`);

        if (process.env.NODE_ENV != "production" && process.env.DEV_GUILD) {
            await rest.put(
                Routes.applicationGuildCommands(
                    client.user!.id,
                    process.env.DEV_GUILD
                ),
                { body: COMMANDS }
            );
            logger.done(
                `Application commands for ${process.env.DEV_GUILD} have been updated.`
            );
        } else {
            await rest.put(Routes.applicationCommands(client.user!.id), {
                body: COMMANDS,
            });
            logger.done(`Global application commands have been updated.`);
        }
    } catch (e) {
        console.error(e);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isCommand()) {
            logger.debug(`Command received: /${interaction.commandName}`);

            // The revolutionary Jan command handler
            switch (interaction.commandName) {
                case "bridge":
                    if (
                        !interaction.memberPermissions?.has("MANAGE_GUILD") &&
                        ["confirm", "unlink"].includes(
                            interaction.options.getSubcommand(true)
                        )
                    ) {
                        return await interaction.reply({
                            content: `\`MANAGE_GUILD\` permission is required for this.`,
                            ephemeral: true,
                        });
                    }

                    const ownPerms = (
                        interaction.channel as TextChannel
                    ).permissionsFor(client.user!)!;
                    switch (interaction.options.getSubcommand(true)) {
                        case "confirm": {
                            if (!ownPerms.has("MANAGE_WEBHOOKS"))
                                return interaction.reply(
                                    "Sorry, I lack permission to manage webhooks in this channel."
                                );

                            const id = interaction.options.getString(
                                "id",
                                true
                            );
                            const request = await BRIDGE_REQUESTS.findOne({
                                id: id,
                            });
                            if (!request || request.expires < Date.now())
                                return await interaction.reply("Unknown ID.");

                            const bridgedCount = await BRIDGE_CONFIG.count({
                                discord: interaction.channelId,
                            });
                            if (bridgedCount > 0)
                                return await interaction.reply(
                                    "This channel is already bridged."
                                );

                            const webhook = await(
                                interaction.channel as TextChannel
                            ).createWebhook("AutoMod Bridge", {
                                avatar: client.user?.avatarURL(),
                            });

                            await BRIDGE_REQUESTS.remove({ id: id });
                            await BRIDGE_CONFIG.insert({
                                discord: interaction.channelId,
                                revolt: request.revolt,
                                discordWebhook: {
                                    id: webhook.id,
                                    token: webhook.token || "",
                                },
                            });

                            return await interaction.reply(
                                `✅ Channel bridged!`
                            );
                        }

                        case "unlink": {
                            const res = await BRIDGE_CONFIG.findOneAndDelete({
                                discord: interaction.channelId,
                            });
                            if (res?._id) {
                                await interaction.reply("Channel unbridged.");
                                if (
                                    ownPerms.has("MANAGE_WEBHOOKS") &&
                                    res.discordWebhook
                                ) {
                                    try {
                                        const hooks = await(
                                            interaction.channel as TextChannel
                                        ).fetchWebhooks();
                                        if (hooks.get(res?.discordWebhook?.id))
                                            await hooks
                                                .get(res?.discordWebhook?.id)
                                                ?.delete(
                                                    "Channel has been unbridged"
                                                );
                                    } catch (_) {}
                                }
                            } else
                                await interaction.reply(
                                    "This channel is not bridged."
                                );

                            break;
                        }

                        case "config": {
                            const configKey = interaction.options.getString(
                                "key",
                                true
                            ) as keyof typeof CONFIG_KEYS;
                            const newValue = interaction.options.getBoolean(
                                "value",
                                false
                            );

                            if (newValue == null) {
                                const currentState =
                                    (
                                        await BRIDGE_CONFIG.findOne({
                                            discord: interaction.channelId,
                                        })
                                    )?.config?.[configKey] ?? false;

                                return await interaction.reply({
                                    ephemeral: true,
                                    embeds: [
                                        new MessageEmbed()
                                            .setAuthor({
                                                name: "Bridge Configuration",
                                            })
                                            .setTitle(configKey)
                                            .setDescription(
                                                `${CONFIG_KEYS[configKey].description}\n\nCurrent state: \`${currentState}\``
                                            )
                                            .toJSON(),
                                    ],
                                });
                            }

                            await BRIDGE_CONFIG.update(
                                { discord: interaction.channelId },
                                {
                                    $set: { [`config.${configKey}`]: newValue },
                                    $setOnInsert: {
                                        discord: interaction.channelId,
                                    },
                                },
                                { upsert: true }
                            );

                            return await interaction.reply({
                                ephemeral: true,
                                content: `Option \`${configKey}\` has been updated to \`${newValue}\`.`,
                            });
                        }

                        case "help": {
                            const isPrivileged =
                                !!interaction.memberPermissions?.has(
                                    "MANAGE_GUILD"
                                );
                            const INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=536996864&scope=bot%20applications.commands`;
                            const embed = new MessageEmbed()
                                .setColor("#ff6e6d")
                                .setAuthor({
                                    name: "AutoMod Revolt Bridge",
                                    iconURL: client.user?.displayAvatarURL(),
                                });

                            embed.setDescription(
                                "[AutoMod](https://automod.me) is a utility and moderation bot for [Revolt](https://revolt.chat). " +
                                    "This Discord bot allows you to link your Discord servers to your Revolt servers " +
                                    "by mirroring messages between text channels."
                            );

                            embed.addField(
                                "Setting up a bridge",
                                isPrivileged
                                    ? "The bridge process is initialized by running the `/bridge link` command in the Revolt " +
                                          "channel you wish to bridge.\n" +
                                          "Afterwards you can run the `/bridge confirm` command in the correct Discord channel to finish the link."
                                    : "You don't have `Manage Messages` permission - Please ask a moderator to configure the bridge."
                            );

                            embed.addField(
                                "Adding AutoMod to your server",
                                `You can add the Revolt bot to your server ` +
                                    `[here](https://app.revolt.chat/bot/${revoltClient.user?._id} "Open Revolt"). To add the Discord counterpart, ` +
                                    `click [here](${INVITE_URL} "Add Discord bot").`
                            );

                            embed.addField(
                                "Contact",
                                `If you have any questions regarding this bot or the Revolt counterpart, feel free to join ` +
                                    `[this](https://discord.gg/4pZgvqgYJ8) Discord server or [this](https://rvlt.gg/jan) Revolt server.\n` +
                                    `If you want to report a bug, suggest a feature or browse the source code, ` +
                                    `feel free to do so [on GitHub](https://github.com/janderedev/automod).\n` +
                                    `For other inquiries, please contact \`contact@automod.me\`.\n\n` +
                                    `Before using this bot, please read the [Privacy Policy](${PRIVACY_POLICY_URL})!`
                            );

                            await interaction.reply({
                                embeds: [embed],
                                ephemeral: true,
                            });
                            break;
                        }

                        case "opt_out": {
                            const optOut = interaction.options.getBoolean(
                                "opt_out",
                                false
                            );
                            if (optOut == null) {
                                const userConfig =
                                    await BRIDGE_USER_CONFIG.findOne({
                                        id: interaction.user.id,
                                    });
                                if (userConfig?.optOut) {
                                    return await interaction.reply({
                                        ephemeral: true,
                                        content:
                                            "You are currently **opted out** of message bridging. " +
                                            "Users on Revolt **will not** see your username, avatar or message content.",
                                    });
                                } else {
                                    return await interaction.reply({
                                        ephemeral: true,
                                        content:
                                            "You are currently **not** opted out of message bridging. " +
                                            "All your messages in a bridged channel will be sent to the associated Revolt channel.",
                                    });
                                }
                            } else {
                                await BRIDGE_USER_CONFIG.update(
                                    { id: interaction.user.id },
                                    {
                                        $setOnInsert: {
                                            id: interaction.user.id,
                                        },
                                        $set: { optOut },
                                    },
                                    { upsert: true }
                                );

                                return await interaction.reply({
                                    ephemeral: true,
                                    content:
                                        `You have **opted ${
                                            optOut ? "out of" : "into"
                                        }** message bridging. ` +
                                        (optOut
                                            ? "Your username, avatar and message content will no longer be visible on Revolt.\n" +
                                              "Please note that some servers may be configured to automatically delete your messages."
                                            : "All your messages in a bridged channel will be sent to the associated Revolt channel."),
                                });
                            }
                        }

                        case "status": {
                            const bridgeConfig = await BRIDGE_CONFIG.findOne({
                                discord: interaction.channelId,
                            });

                            if (!bridgeConfig?.revolt) {
                                return await interaction.reply({
                                    ephemeral: true,
                                    content:
                                        "This channel is **not** bridged. No message content data will be processed.",
                                });
                            } else {
                                return await interaction.reply({
                                    ephemeral: true,
                                    content:
                                        "This channel is **bridged to Revolt**. Your messages will " +
                                        "be processed and sent to [Revolt](<https://revolt.chat>) according to AutoMod's " +
                                        `[Privacy Policy](<${PRIVACY_POLICY_URL}>).`,
                                });
                            }

                            break;
                        }

                        default:
                            await interaction.reply("Unknown subcommand");
                    }

                    break;
            }
        } else if (interaction.isMessageContextMenu()) {
            logger.debug(
                `Received context menu: ${interaction.targetMessage.id}`
            );

            switch (interaction.commandName) {
                case "Message Info":
                    const message = interaction.targetMessage;
                    const bridgeInfo = await BRIDGED_MESSAGES.findOne({
                        "discord.messageId": message.id,
                    });
                    const messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${message.id}`;

                    if (!bridgeInfo)
                        return await interaction.reply({
                            ephemeral: true,
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({
                                        name: "Message info",
                                        url: messageUrl,
                                    })
                                    .setDescription(
                                        "This message has not been bridged."
                                    )
                                    .setColor("#7e96ff"),
                            ],
                        });
                    else {
                        const embed = new MessageEmbed();

                        embed.setColor("#7e96ff");
                        embed.setAuthor({
                            name: "Message info",
                            url: messageUrl,
                        });

                        embed.addField(
                            "Origin",
                            bridgeInfo.origin == "discord"
                                ? "Discord"
                                : "Revolt",
                            true
                        );

                        if (bridgeInfo.origin == "discord") {
                            embed.addField(
                                "Bridge Status",
                                bridgeInfo.revolt.messageId
                                    ? "Bridged"
                                    : bridgeInfo.revolt.nonce
                                    ? "ID unknown"
                                    : "Unbridged",
                                true
                            );
                        } else {
                            embed.addField(
                                "Bridge Status",
                                bridgeInfo.discord.messageId
                                    ? "Bridged"
                                    : "Unbridged",
                                true
                            );

                            if (bridgeInfo.channels?.revolt) {
                                const channel = await revoltClient.channels.get(
                                    bridgeInfo.channels.revolt
                                );
                                const revoltMsg = await revoltFetchMessage(
                                    bridgeInfo.revolt.messageId,
                                    channel
                                );

                                if (revoltMsg) {
                                    const author = await revoltFetchUser(
                                        revoltMsg.author_id
                                    );
                                    embed.addField(
                                        "Message Author",
                                        `**@${author?.username}** (${revoltMsg.author_id})`
                                    );
                                }
                            }
                        }

                        embed.addField(
                            "Bridge Data",
                            `Origin: \`${bridgeInfo.origin}\`\n` +
                                `Discord ID: \`${bridgeInfo.discord.messageId}\`\n` +
                                `Revolt ID: \`${bridgeInfo.revolt.messageId}\`\n` +
                                `Revolt Nonce: \`${bridgeInfo.revolt.nonce}\`\n` +
                                `Discord Channel: \`${bridgeInfo.channels?.discord}\`\n` +
                                `Revolt Channel: \`${bridgeInfo.channels?.revolt}\``
                        );

                        return await interaction.reply({
                            ephemeral: true,
                            embeds: [embed],
                        });
                    }
            }
        }
    } catch (e) {
        console.error(e);
        if (interaction.isCommand())
            interaction.reply("An error has occurred: " + e).catch(() => {});
    }
});
