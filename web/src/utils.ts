import axios from "axios";
import localforage from "localforage";
import { API_URL } from "./App";

async function getAuthHeaders() {
    const auth: any = await localforage.getItem('auth');
    return {
        'x-auth-user': auth.user,
        'x-auth-token': auth.token,
    }
}

async function getAuth(): Promise<false|{ user: string, token: string }> {
    const auth: any = await localforage.getItem('auth');
    if (!auth) return false;

    try {
        const res = await axios.get(API_URL, {
            headers: {
                'x-auth-user': auth.user,
                'x-auth-token': auth.token,
            }
        });

        if (res.data?.authenticated) return { user: auth.user ?? '', token: auth.token ?? '' }
        else return false;
    } catch(e) { return false } // todo: dont assume we're logged out if death
}

export { getAuth, getAuthHeaders }