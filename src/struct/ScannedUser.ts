class ScannedUser {
    id: string;
    server: string;
    lastLog: number;
    approved: boolean = false;
    lastLoggedProfile?: {
        username: string;
        nickname?: string;
        status?: string;
        profile?: string;
    }
}

export default ScannedUser;
