// fuck slash commands

import { client } from "./client";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { BRIDGE_CONFIG, BRIDGE_REQUESTS, logger } from "..";
import { TextChannel } from "discord.js";

const COMMANDS: any[] = [
    {
        name: 'bridge',
        description: 'Confirm or delete Revolt bridges',
        options: [
            {
                name: 'confirm',
                description: 'Confirm a bridge initiated from Revolt',
                type: 1, // Subcommand
                options: [
                    {
                        name: "id",
                        description: "The bridge request ID",
                        required: true,
                        type: 3,
                    }
                ],
            },
            {
                name: 'unlink',
                description: 'Unbridge the current channel',
                type: 1,
            },
        ],
    }
];

const rest = new REST({ version: '9' }).setToken(process.env['DISCORD_TOKEN']!);

client.once('ready', async () => {
    try {
        logger.info(`Refreshing application commands.`);

        if (process.env.NODE_ENV != 'production' && process.env.DEV_GUILD) {
            await rest.put(
                Routes.applicationGuildCommands(client.user!.id, process.env.DEV_GUILD),
                { body: COMMANDS },
            );
            logger.done(`Application commands for ${process.env.DEV_GUILD} have been updated.`);
        } else {
            await rest.put(
                Routes.applicationCommands(client.user!.id),
                { body: COMMANDS },
            );
            logger.done(`Global application commands have been updated.`);
        }
    } catch(e) {
        console.error(e);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isCommand()) return;

        logger.debug(`Command received: /${interaction.commandName}`);

        // The revolutionary Jan command handler
        switch(interaction.commandName) {
            case 'bridge':
                if (!interaction.memberPermissions?.has('MANAGE_GUILD')) {
                    return await interaction.reply(`\`MANAGE_GUILD\` permission is required for this.`);
                }

                const ownPerms = (interaction.channel as TextChannel).permissionsFor(client.user!)!;
                switch(interaction.options.getSubcommand(true)) {
                    case 'confirm':
                        if (!ownPerms.has('MANAGE_WEBHOOKS'))
                            return interaction.reply('Sorry, I lack permission to manage webhooks in this channel.');

                        const id = interaction.options.getString('id', true);
                        const request = await BRIDGE_REQUESTS.findOne({ id: id });
                        if (!request || request.expires < Date.now()) return await interaction.reply('Unknown ID.');

                        const webhook = await (interaction.channel as TextChannel)
                            .createWebhook('AutoMod Bridge', { avatar: client.user?.avatarURL() });

                        await BRIDGE_REQUESTS.remove({ id: id });
                        await BRIDGE_CONFIG.insert({
                            discord: interaction.channelId,
                            revolt: request.revolt,
                            discordWebhook: {
                                id: webhook.id,
                                token: webhook.token || '',
                            }
                        });

                        return await interaction.reply(`✅ Channel bridged!`);
                    case 'unlink':
                        const res = await BRIDGE_CONFIG.findOneAndDelete({ discord: interaction.channelId });
                        if (res?._id) {
                            await interaction.reply('Channel unbridged.');
                            if (ownPerms.has('MANAGE_WEBHOOKS') && res.discordWebhook) {
                            try {
                                const hooks = await (interaction.channel as TextChannel).fetchWebhooks();
                                if (hooks.get(res?.discordWebhook?.id)) await hooks.get(res?.discordWebhook?.id)
                                    ?.delete('Channel has been unbridged');
                            } catch(_) {}
                        }
                        }
                        else await interaction.reply('This channel is not bridged.');

                        break;
                    default: await interaction.reply('Unknown subcommand');
                }

                break;
        }
    } catch(e) {
        console.error(e);
        if (interaction.isCommand()) interaction.reply('An error has occurred: ' + e).catch(() => {});
    }
});
