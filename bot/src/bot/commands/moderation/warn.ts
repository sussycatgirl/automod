import SimpleCommand from "../../../struct/commands/SimpleCommand";
import { dedupeArray, embed, EmbedColor, generateInfractionDMEmbed, getDmChannel, isModerator, NO_MANAGER_MSG, parseUserOrId, sanitizeMessageContent, storeInfraction } from "../../util";
import Infraction from "automod/dist/types/antispam/Infraction";
import { ulid } from "ulid";
import InfractionType from "automod/dist/types/antispam/InfractionType";
import { fetchUsername, logModAction } from "../../modules/mod_logs";
import CommandCategory from "../../../struct/commands/CommandCategory";
import { SendableEmbed } from "revolt-api";
import { User } from "@janderedev/revolt.js";
import logger from "../../logger";

export default {
    name: 'warn',
    aliases: null,
    removeEmptyArgs: false,
    description: 'add an infraction to an user\'s record',
    category: CommandCategory.Moderation,
    run: async (message, args, serverConfig) => {
        if (!await isModerator(message)) return message.reply(NO_MANAGER_MSG);

        const userInput = args.shift() || '';
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
            embeds: [ embed('Warn reason may not be longer than 200 characters.', null, EmbedColor.SoftError) ]
        });

        const embeds: SendableEmbed[] = [];
        const handledUsers: string[] = [];
        const targetUsers: User|{ _id: string }[] = [];

        const targetInput = dedupeArray(
            // Replied messages
            (await Promise.allSettled(
                (message.reply_ids ?? []).map(msg => message.channel?.fetchMessage(msg))
            ))
            .filter(m => m.status == 'fulfilled').map(m => (m as any).value.author_id),
            // Provided users
            userInput.split(','),
        );

        for (const userStr of targetInput) {
            try {
                let user = await parseUserOrId(userStr);
                if (!user) {
                    if (message.reply_ids?.length && userStr == userInput) {
                        reason = reason ? `${userInput} ${reason}` : userInput;
                    }
                    else {
                        embeds.push(embed(`I can't resolve \`${sanitizeMessageContent(userStr).trim()}\` to a user.`, null, '#ff785d'));
                    }
                    continue;
                }

                // Silently ignore duplicates
                if (handledUsers.includes(user._id)) continue;
                handledUsers.push(user._id);

                if ((user as any)?.bot != null) return await message.reply({ embeds: [
                    embed('You cannot warn bots.', null, EmbedColor.SoftError)
                ]});

                targetUsers.push(user);
            } catch(e) {
                console.error(e);
                embeds.push(embed(
                    `Failed to warn target \`${sanitizeMessageContent(userStr).trim()}\`: ${e}`,
                    'Failed to warn: An error has occurred',
                    EmbedColor.Error,
                ));
            }
        }

        for (const user of targetUsers) {
            let infraction = {
                _id: ulid(),
                createdBy: message.author_id,
                user: user._id,
                reason: reason || 'No reason provided',
                server: message.serverContext._id,
                type: InfractionType.Manual,
                date: Date.now(),
            } as Infraction;

            let { userWarnCount } = await storeInfraction(infraction);
            await Promise.all([
                logModAction(
                    'warn',
                    message.serverContext,
                    message.member!,
                    user._id,
                    reason || 'No reason provided',
                    infraction._id,
                    `This is warn number ${userWarnCount} for this user.`
                ),
                (async () => {
                    if (serverConfig?.dmOnWarn) {
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
                })(),
            ]);

            embeds.push({
                title: `User warned`,
                icon_url: user instanceof User ? user.generateAvatarURL() : undefined,
                colour: EmbedColor.Success,
                description: `This is ${userWarnCount == 1 ? '**the first warn**' : `warn number **${userWarnCount}**`}` +
                    ` for ${await fetchUsername(user._id)}.\n` +
                    `**Infraction ID:** \`${infraction._id}\`\n` +
                    `**Reason:** \`${infraction.reason}\``
            });
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
