import InfractionType from "./InfractionType";

class Infraction {
    _id: string;
    type: InfractionType;
    actionType?: 'kick'|'ban';
    user: string;
    createdBy: string|null;
    server: string;
    channel?: string;
    message?: string;
    targetMessages?: string[];
    reason: string;
    date: number;
}

export default Infraction;
