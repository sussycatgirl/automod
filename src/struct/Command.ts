class Command {
    name: string;
    aliases: string[] | null;
    description: string | null;
    run: Function;
    serverOnly: boolean;
}

export default Command;
