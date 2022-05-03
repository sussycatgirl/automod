import { decodeTime } from "ulid";
import CommandCategory from "../../../struct/commands/CommandCategory";
import SimpleCommand from "../../../struct/commands/SimpleCommand";
import MessageCommandContext from "../../../struct/MessageCommandContext";
import { ULID_REGEX } from "../../util";

export default {
    name: 'debug',
    aliases: null,
    description: 'Gives info helpful for development and debugging',
    syntax: '/debug [ULID|Discord ID|(empty)]',
    category: CommandCategory.Misc,
    run: async (message: MessageCommandContext, args: string[]) => {
        if (ULID_REGEX.test(args[0])) {
            const ts = decodeTime(args[0]);
            const tsSmall = Math.round(ts / 1000);
            await message.reply(
                `ULID: \`${args[0]}\`\n` +
                `TS: \`${ts}\` (<t:${tsSmall}:F> / <t:${tsSmall}:R>)`,
                false
            );
        } else if (validateSnowflake(args[0])) {
            const date = convertSnowflakeToDate(args[0]);
            const ts = date.getTime(),
                  tsSmall = Math.round(ts / 1000);

            await message.reply(
                `Discord Snowflake: \`${args[0]}\`\n` +
                `TS: \`${ts}\` (<t:${tsSmall}:F> / <t:${tsSmall}:R>)`,
                false
            );
        } else {
            await message.reply(
                `Server ID: ${message.channel?.server_id || 'None'}\n`
                + `Server context: ${message.serverContext._id} `
                    + `(${message.serverContext._id == message.channel?.server_id ? 'This server' : message.serverContext.name})\n`
                + `Channel ID: ${message.channel_id}\n`
                + `User ID: ${message.author_id}`,
                false
            );
        }
    }
} as SimpleCommand;


/* The below is yoinked from https://github.com/vegeta897/snow-stamp/blob/main/src/convert.js */

const DISCORD_EPOCH = 1420070400000;

// Converts a snowflake ID string into a JS Date object using the provided epoch (in ms), or Discord's epoch if not provided
function convertSnowflakeToDate(snowflake: string|bigint, epoch = DISCORD_EPOCH) {
	// Convert snowflake to BigInt to extract timestamp bits
	// https://discord.com/developers/docs/reference#snowflakes
	const milliseconds = BigInt(snowflake) >> 22n;
	return new Date(Number(milliseconds) + epoch);
}

// Validates a snowflake ID string and returns a JS Date object if valid
function validateSnowflake(snowflake: string, epoch?: number) {
    if (isNaN(parseInt(snowflake))) return false;

	if (parseInt(snowflake) < 4194304) {
		//throw new Error(
		//	"That doesn't look like a snowflake. Snowflakes are much larger numbers."
		//)
        return false;
	}

	const timestamp = convertSnowflakeToDate(snowflake, epoch);

	if (Number.isNaN(timestamp.getTime())) {
		//throw new Error(
		//	"That doesn't look like a snowflake. Snowflakes have fewer digits."
		//)
        return false;
	}

	return timestamp;
}
