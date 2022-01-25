import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H2 } from '@revoltchat/ui/lib/components/atoms/heading/H2';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";

type Server = { id: string, perms: 0|1|2|3, name: string, iconURL?: string, bannerURL?: string }

function permissionName(p: number) {
    switch(p) {
        case 0:  return 'User';
        case 1:  return 'Moderator';
        case 2:
        case 3:  return 'Manager';
        default: return 'Unknown';
    }
}

const Dashboard: FunctionComponent = () => {
    const [loading, setLoading] = useState(true);
    const [servers, setServers] = useState([] as Server[]);
    const navigate = useNavigate();

    const loadServers = useCallback(async () => {
        try {
            const res = await axios.get(API_URL + '/dash/servers', { headers: await getAuthHeaders() });
            setServers(res.data.servers);
            setLoading(false);
        } catch(e) {
            console.error(e);
        }
    }, []);

    useEffect(() => { loadServers() }, []);

    return (
        <div>
            <H1>dashbord</H1>
            <br/>
            <p hidden={!loading}>loading</p>
            {
                servers.map(server => <div className="server-card" style={{ paddingTop: '10px' }} key={server.id}>
                    <img
                        src={server.iconURL ?? 'https://dl.insrt.uk/projects/revolt/emotes/trol.png'}
                        width={48}
                        height={48}
                        style={{
                            float: 'left',
                            marginLeft: '8px',
                            marginRight: '12px',
                            borderRadius: "50%",
                        }}
                    />
                    <div style={{
                        float: 'left',
                        maxWidth: '240px',
                        textOverflow: 'clip',
                        overflow: 'clip',
                        whiteSpace: 'nowrap',
                    }}>
                        <H2>{server.name} ({permissionName(server.perms)})</H2>
                        <code style={{ color: 'var(--foreground)' }}>{server.id}</code>
                    </div>
                    <div>
                        <Button
                            style={{ position: 'relative', top: '8px', left: '12px' }}
                            onClick={() => {
                                navigate(`/dashboard/${server.id}`);
                            }}
                        >Open</Button>
                    </div>
                    <div style={{ clear: 'both' }} />
                </div>)
            }
        </div>
    );
}

export default Dashboard;
