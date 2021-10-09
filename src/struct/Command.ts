class Command {
    name: string;
    aliases: string[] | null;
    description: string | null;
    syntax?: string | null;
    run: Function;
    serverOnly: boolean;
}

export default Command;
