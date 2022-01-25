import localforage from "localforage";
import axios from 'axios';
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { InputBox } from '@revoltchat/ui/lib/components/atoms/inputs/InputBox';
import { Checkbox } from '@revoltchat/ui/lib/components/atoms/inputs/Checkbox';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H3 } from '@revoltchat/ui/lib/components/atoms/heading/H3';
import { H4 } from '@revoltchat/ui/lib/components/atoms/heading/H4';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";
import { useParams } from "react-router-dom";

type Server = { id?: string, perms?: 0|1|2, name?: string, description?: string, iconURL?: string, bannerURL?: string, serverConfig?: any }

const ServerDashboard: FunctionComponent = () => {
    const [serverInfo, setServerInfo] = useState({} as Server);
    const [status, setStatus] = useState('');

    const [prefix, setPrefix] = useState('' as string|undefined);
    const [prefixAllowSpace, setPrefixAllowSpace] = useState(false);

    const { serverid } = useParams();

    const saveConfig = useCallback(async () => {
        alert('server config saved (not really)');
    }, [ prefix, prefixAllowSpace ]);

    const loadInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/dash/server/${serverid}`, { headers: await getAuthHeaders() });
            console.log(res.data);
            const server: Server = res.data.server;
            setServerInfo(server);

            setPrefix(server.serverConfig?.prefix || undefined);
            setPrefixAllowSpace(!!server.serverConfig?.spaceAfterPrefix);
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
                <H4>{serverInfo.description ?? <i>No server description set</i>}</H4>
                <br/>
                <div style={{ paddingLeft: '10px' }}>
                    <H3>Prefix</H3>
                    <InputBox
                        style={{ width: '150px', }}
                        placeholder="Enter a prefix..."
                        value={prefix}
                        onChange={e => {
                            setPrefix(e.currentTarget.value);
                        }}
                    />
                    <Checkbox
                        style={{ width: '400px' }}
                        value={prefixAllowSpace}
                        onChange={() => {
                            setPrefixAllowSpace(!prefixAllowSpace);
                        }}
                        title="Allow space after prefix"
                        description={'Whether the bot recognizes a command if the prefix is followed by a space. Enable if your prefix is a word.'}
                    />
                    <Button
                        style={{ marginTop: "16px" }}
                        onClick={saveConfig}
                    >Save</Button>
                </div>
            </div>
        </>
    );
}

export default ServerDashboard;
