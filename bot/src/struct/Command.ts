import { ChannelPermission, ServerPermission } from "@janderedev/revolt.js";

class Command {
    name: string;
    aliases: string[] | null;
    description: string | null;
    syntax?: string | null;
    restrict?: 'BOTOWNER' | null;
    removeEmptyArgs?: boolean | null;
    run: Function;
    category?: string;
    requiredPermissions?: {
        server?: keyof typeof ServerPermission,
        channel?: keyof typeof ChannelPermission,
    }
}

export default Command;
