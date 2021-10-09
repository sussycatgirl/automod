import { Member } from "revolt.js/dist/maps/Members";

let ServerPermissions = {
    ['View' as string]: 1 << 0,
    ['ManageRoles' as string]: 1 << 1,
    ['ManageChannels' as string]: 1 << 2,
    ['ManageServer' as string]: 1 << 3,
    ['KickMembers' as string]: 1 << 4,
    ['BanMembers' as string]: 1 << 5,
    ['ChangeNickname' as string]: 1 << 12,
    ['ManageNicknames' as string]: 1 << 13,
    ['ChangeAvatar' as string]: 1 << 14,
    ['RemoveAvatars' as string]: 1 << 15,
}


function hasPerm(member: Member, perm:  'View'|'ManageRoles'|'ManageChannels'|'ManageServer'|  // its late and im tired
                                        'KickMembers'|'BanMembers'|'ChangeNickname'|           // dont judge my code
                                        'ManageNicknames'|'ChangeAvatar'|'RemoveAvatars') {
    let p = ServerPermissions[perm];
    if (member.server?.owner == member.user?._id) return true;
    
    // TODO how the fuck do bitfields work
    return false;
}

export { hasPerm }
