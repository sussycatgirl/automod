class Command {
    name: string;
    aliases: string[] | null;
    description: string | null;
    syntax?: string | null;
    restrict?: 'BOTOWNER' | null;
    removeEmptyArgs?: boolean | null;
    run: Function;
    category?: string;
}

export default Command;
