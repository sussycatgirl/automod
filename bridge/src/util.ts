import { Channel } from "revolt.js";
import { Message } from "revolt.js";
import { User } from "revolt.js";
import { Message as DiscordMessage, TextChannel, User as DiscordUser } from "discord.js";
import { client as discordClient } from "./discord/client";
import { client as revoltClient } from "./revolt/client"

// Grab user from cache or fetch, return undefined if error
async function revoltFetchUser(id?: string): Promise<User|undefined> {
    if (!id) return undefined;

    let user = revoltClient.users.get(id);
    if (user) return user;

    try { user = await revoltClient.users.fetch(id) } catch(_) { }

    return user;
}

async function revoltFetchMessage(id?: string, channel?: Channel): Promise<Message|undefined> {
    if (!id || !channel) return undefined;

    let message = revoltClient.messages.get(id);
    if (message) return message;

    try { message = await channel.fetchMessage(id) } catch(_) { }

    return message;
}

async function discordFetchMessage(id?: string, channelId?: string): Promise<DiscordMessage|undefined> {
    if (!id || !channelId) return undefined;

    const channel = discordClient.channels.cache.get(channelId);
    if (!channel || !(channel instanceof TextChannel)) return undefined;

    let message = channel.messages.cache.get(id);
    if (message) return message;

    try { message = await channel.messages.fetch(id) } catch(_) { }

    return message;
}

// doesnt seem to work idk
async function discordFetchUser(id?: string): Promise<DiscordUser|undefined> {
    if (!id) return undefined;

    let user = discordClient.users.cache.get(id);
    if (user) return user;

    try { user = await discordClient.users.fetch(id) } catch(_) { }

    return user;
}

function clipText(text: string, limit: number) {
    if (text.length < limit) return text;
    else return text.substring(0, limit-4) + ' ...';
}

export {
    revoltFetchUser,
    revoltFetchMessage,
    discordFetchMessage,
    discordFetchUser,
    clipText,
}
