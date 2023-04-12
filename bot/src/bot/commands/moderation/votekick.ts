import { FindResult } from "monk";
import { ulid } from "ulid";
import { client, dbs } from "../../../";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { logModAction } from "../../modules/mod_logs";
import { storeTempBan } from "../../modules/tempbans";
import { getPermissionLevel, isModerator, parseUser } from "../../util";

type VoteEntry = {
    id: string;
    target: string;
    user: string;   // Whoever issued the vote kick
    server: string;
    time: number;
    ignore: boolean;
}

export default {
    name: 'votekick',
    aliases: [ 'voteban' ],
    description: 'Allow trusted users to vote kick users',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            const serverConfig = await dbs.SERVERS.findOne({ id: message.serverContext.id });
            if (!serverConfig?.votekick?.enabled) return message.reply('Vote kick is not enabled for this server.');
            if (!message.member!.roles?.filter(r => serverConfig.votekick?.trustedRoles.includes(r)).length
             && !(await isModerator(message))) {
                return message.reply('🔒 Access denied');
            }
            if (args.length == 0) return message.reply(`**Votekick configuration:**\n`
                + `Votes required: **${serverConfig.votekick.votesRequired}**\n`
                + `Ban duration: **${serverConfig.votekick.banDuration}** (In minutes, -1 = Kick, 0: Permanent)\n`
                + `Trusted role IDs: \`${serverConfig.votekick.trustedRoles.join('\`, \`')}\`\n\n`
                + `Run \`/votekick [Username, ID or @mention]\` to votekick someone.`);

            const target = await parseUser(args[0]);
            if (!target) return message.reply('Sorry, I can\'t find this user.');
            const targetMember = await message.serverContext.fetchMember(target);

            if (await getPermissionLevel(target, message.serverContext) > 0
             || targetMember.roles?.filter(r => serverConfig.votekick?.trustedRoles.includes(r)).length) {
                return message.reply('This target can not be votekicked.');
             }

            const vote: VoteEntry = {
                id: ulid(),
                target: target.id,
                user: message.authorId!,
                server: message.serverContext.id,
                time: Date.now(),
                ignore: false,
            }

            const votes = await dbs.VOTEKICKS.find({
                server: message.serverContext.id,
                target: target.id,
                time: {
                    $gt: Date.now() - 1000 * 60 * 30,  // Last 30 minutes
                },
                ignore: false,
            });

            if (votes.find(v => v.user == message.authorId)) return message.reply('You can\'t vote twice for this user.');

            await dbs.VOTEKICKS.insert(vote);
            votes.push({ _id: '' as any, ...vote });

            await logModAction(
                "votekick",
                message.serverContext,
                message.member!,
                target.id,
                `n/a`,
                vote.id,
                `This is vote ${votes.length}/${serverConfig.votekick.votesRequired} for this user.`,
            );

            if (votes.length >= serverConfig.votekick.votesRequired) {
                if (serverConfig.votekick.banDuration == -1) {
                    targetMember.kick();
                } else if (serverConfig.votekick.banDuration == 0) {
                    message.serverContext.banUser(target.id, { reason: 'Automatic permanent ban triggered by /votekick' });
                } else {
                    message.serverContext.banUser(target.id, { reason: `Automatic temporary ban triggered by /votekick `
                        + `(${serverConfig.votekick.banDuration} minutes)` });

                    await storeTempBan({
                        id: ulid(),
                        bannedUser: target.id,
                        server: message.serverContext.id,
                        until: Date.now() + (1000 * 60 * serverConfig.votekick.banDuration),
                    });
                }

                message.reply(`**${votes.length}/${serverConfig.votekick.votesRequired}** votes - `
                    + `Banned @${target.username} for ${serverConfig.votekick.banDuration} minutes.`); // Todo: display ban duration properly (Permban, kick, etc)

                await dbs.VOTEKICKS.update({
                    server: message.serverContext.id,
                    target: target.id,
                    time: { $gt: Date.now() - 1000 * 60 * 30 },
                    ignore: false,
                }, { $set: { ignore: true } });
            } else {
                message.reply(`Voted to temporarily remove **@${target.username}**. `
                    + `**${votes.length}/${serverConfig.votekick.votesRequired}** votes.`);
            }
        } catch(e) {
            console.error(e);
            message.reply('Oops, something happened: ' + e);
        }
    }
} as SimpleCommand;

export { VoteEntry }
