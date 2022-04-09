// Stores global info about a particular user in the database
export default class DbUser {
    // User ID
    id: string;

    // Blacklists the user from interacting with the bot
    ignore?: boolean;

    // Whether the user is globally marked as bad actor
    globalBlacklist?: boolean;
}
