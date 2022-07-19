import { User } from "@janderedev/revolt.js";
import { SendableEmbed } from "revolt-api";
import { ulid } from "ulid";
import { client } from "../../../";
import Infraction from "automod/dist/types/antispam/Infraction";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import logger from "../../logger";
import { fetchUsername, logModAction } from "../../modules/mod_logs";
import { dedupeArray, embed, EmbedColor, generateInfractionDMEmbed, getDmChannel, isModerator, NO_MANAGER_MSG, parseUser, parseUserOrId, sanitizeMessageContent, storeInfraction } from "../../util";

export default {
    name: 'kick',
    aliases: [ 'yeet', 'vent' ],
    description: 'Kick a member from the server',
    syntax: '/kick @username [reason?]',
    removeEmptyArgs: true,
    category: CommandCategory.Moderation,
    run: async (message, args, serverConfig) => {
        if (!await isModerator(message))
            return message.reply(NO_MANAGER_MSG);
        if (!message.serverContext.havePermission('KickMembers')) {
            return await message.reply(`Sorry, I do not have \`KickMembers\` permission.`);
        }

        const userInput = !message.reply_ids?.length ? args.shift() || '' : undefined;
        if (!userInput && !message.reply_ids?.length) return message.reply({ embeds: [
            embed(
                `Please specify one or more users by replying to their message while running this command or ` +
                  `by specifying a comma-separated list of usernames.`,
                'No target user specified',
                EmbedColor.SoftError,
            ),
        ] });
        
        let reason = args.join(' ')
        ?.replace(new RegExp('`', 'g'), '\'')
        ?.replace(new RegExp('\n', 'g'), ' ');

        if (reason.length > 200) return message.reply({
            embeds: [ embed('Kick reason may not be longer than 200 characters.', null, EmbedColor.SoftError) ]
        });

        const embeds: SendableEmbed[] = [];
        const handledUsers: string[] = [];
        const targetUsers: User|{ _id: string }[] = [];

        const targetInput = dedupeArray(
            message.reply_ids?.length
                ? (await Promise.allSettled(
                    message.reply_ids.map(msg => message.channel?.fetchMessage(msg))
                ))
                .filter(m => m.status == 'fulfilled').map(m => (m as any).value.author_id)
                : userInput!.split(','),
        );

        for (const userStr of targetInput) {
            try {
                let user = await parseUserOrId(userStr);
                if (!user) {
                    embeds.push(embed(`I can't resolve \`${sanitizeMessageContent(userStr).trim()}\` to a user.`, null, EmbedColor.SoftError));
                    continue;
                }

                // Silently ignore duplicates
                if (handledUsers.includes(user._id)) continue;
                handledUsers.push(user._id);

                if (user._id == message.author_id) {
                    embeds.push(embed('You might want to avoid kicking yourself...', null, EmbedColor.Warning));
                    continue;
                }

                if (user._id == client.user!._id) {
                    embeds.push(embed('I won\'t allow you to get rid of me this easily :trol:', null, EmbedColor.Warning));
                    continue;
                }

                targetUsers.push(user);
            } catch(e) {
                console.error(e);
                embeds.push(embed(
                    `Failed to kick target \`${sanitizeMessageContent(userStr).trim()}\`: ${e}`,
                    `Failed to kick: An error has occurred`,
                    EmbedColor.Error,
                ));
            }
        }

        const members = await message.serverContext.fetchMembers();

        for (const user of targetUsers) {
            try {
                const member = members.members.find(m => m._id.user == user._id);
                if (!member) {
                    embeds.push(embed(''));
                    continue;
                }

                let infId = ulid();
                let infraction: Infraction = {
                    _id: infId,
                    createdBy: message.author_id,
                    date: Date.now(),
                    reason: reason || 'No reason provided',
                    server: message.serverContext._id,
                    type: InfractionType.Manual,
                    user: user._id,
                    actionType: 'kick',
                }

                if (serverConfig?.dmOnKick) {
                    try {
                        const embed = generateInfractionDMEmbed(message.serverContext, serverConfig, infraction, message);
                        const dmChannel = await getDmChannel(user);

                        if (dmChannel.havePermission('SendMessage') || dmChannel.havePermission('SendEmbeds')) {
                            await dmChannel.sendMessage({ embeds: [ embed ] });
                        }
                        else logger.warn('Missing permission to DM user.');
                    } catch(e) {
                        console.error(e);
                    }
                }

                let [ { userWarnCount } ] = await Promise.all([
                    storeInfraction(infraction),
                    logModAction('kick', message.serverContext, message.member!, user._id, reason, infraction._id),
                    member.kick(),
                ]);

                embeds.push({
                    title: `User kicked`,
                    icon_url: user instanceof User ? user.generateAvatarURL() : undefined,
                    colour: EmbedColor.Success,
                    description: `This is ${userWarnCount == 1 ? '**the first infraction**' : `infraction number **${userWarnCount}**`}` +
                        ` for ${await fetchUsername(user._id)}.\n` +
                        `**User ID:** \`${user._id}\`\n` +
                        `**Infraction ID:** \`${infraction._id}\`\n` +
                        `**Reason:** \`${infraction.reason}\``
                });
            } catch(e) {
                embeds.push(embed(`Failed to kick user ${await fetchUsername(user._id)}: ${e}`, 'Failed to kick user', EmbedColor.Error));
            }
        }

        let firstMsg = true;
        while (embeds.length > 0) {
            const targetEmbeds = embeds.splice(0, 10);

            if (firstMsg) {
                await message.reply({ embeds: targetEmbeds, content: 'Operation completed.' }, false);
            } else {
                await message.channel?.sendMessage({ embeds: targetEmbeds });
            }
            firstMsg = false;
        }
    }
} as SimpleCommand;
