import { client } from "../../..";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { isModerator, NO_MANAGER_MSG, parseUser } from "../../util";

function parseTimeInput(input: string) {
    if (!/([0-9]{1,3}[smhdwy])+/g.test(input)) return null;

    let pieces = input.match(/([0-9]{1,3}[smhdwy])/g) ?? [];
    let res = 0;

    // Being able to specify the same letter multiple times
    // (e.g. 1s1s) and having their values stack is a feature
    for (const piece of pieces) {
        let [ num, letter ] = [ Number(piece.slice(0, piece.length - 1)), piece.slice(piece.length - 1) ];
        let multiplier = 0;

        switch(letter) {
            case 's': multiplier = 1000; break;
            case 'm': multiplier = 1000 * 60; break;
            case 'h': multiplier = 1000 * 60 * 60; break;
            case 'd': multiplier = 1000 * 60 * 60 * 24; break;
            case 'w': multiplier = 1000 * 60 * 60 * 24 * 7; break;
            case 'y': multiplier = 1000 * 60 * 60 * 24 * 365; break;
        }

        res += num * multiplier;
    }

    return res;
}

export default {
    name: 'timeout',
    aliases: [ 'mute' ],
    description: 'Set a timeout on a user',
    category: CommandCategory.Moderation,
    run: async (message: MessageCommandContext, args: string[]) => {
        try {
            if (!await isModerator(message)) return await message.reply(NO_MANAGER_MSG);

            const target = await parseUser(args[0] ?? '');
            if (!target) return await message.reply('No user provided or provided user is not valid');

            const duration = parseTimeInput(args[1] ?? '');
            if (!duration) {
                await client.api.patch(`/servers/${message.serverContext.id}/members/${target.id}` as '/servers/{server}/members/{target}', {
                    timeout: new Date(0).toISOString()
                } as any);
                await message.reply(`Timeout cleared on @${target.username}`);
            }
            else {
                await client.api.patch(`/servers/${message.serverContext.id}/members/${target.id}` as '/servers/{server}/members/{target}', {
                    timeout: new Date(Date.now() + duration).toISOString()
                } as any);
                await message.reply(`Successfully timed out @${target.username}`);
            }
        } catch(e) {
            console.error('' + e);
            message.reply('Something went wrong: ' + e);
        }
    }
} as SimpleCommand;
