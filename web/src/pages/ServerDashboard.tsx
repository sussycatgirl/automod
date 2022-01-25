import localforage from "localforage";
import axios from 'axios';
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { InputBox } from '@revoltchat/ui/lib/components/atoms/inputs/InputBox';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H4 } from '@revoltchat/ui/lib/components/atoms/heading/H4';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";
import { useParams } from "react-router-dom";

type Server = { id: string, perms: 0|1|2, name: string, iconURL?: string, bannerURL?: string }

const ServerDashboard: FunctionComponent = () => {
    const [serverInfo, setServerInfo] = useState({} as any);
    const [status, setStatus] = useState('');
    const { serverid } = useParams();

    const loadInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/dash/server/${serverid}`, { headers: await getAuthHeaders() });
            setServerInfo(res.data.server);
        } catch(e: any) {
            console.error(e);
            setStatus(`${e?.message ?? e}`);
        }
    }, [serverInfo]);

    useEffect(() => { loadInfo() }, []);

    return (
        <>
            <H1>{serverInfo?.name ?? 'Loading...'}</H1>
            {status.length ? <a>{status}</a> : <br/>}
            <div hidden={Object.keys(serverInfo).length == 0}>
                <H4>{serverInfo.description ?? ''}</H4>
            </div>
        </>
    );
}

export default ServerDashboard;
