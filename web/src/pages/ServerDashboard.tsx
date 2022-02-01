import axios from 'axios';
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { InputBox } from '@revoltchat/ui/lib/components/atoms/inputs/InputBox';
import { Checkbox } from '@revoltchat/ui/lib/components/atoms/inputs/Checkbox';
import { LineDivider } from '@revoltchat/ui/lib/components/atoms/layout/LineDivider';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H3 } from '@revoltchat/ui/lib/components/atoms/heading/H3';
import { H4 } from '@revoltchat/ui/lib/components/atoms/heading/H4';
import { Icon } from '@mdi/react';
import { mdiCloseBox } from '@mdi/js';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";
import { useParams } from "react-router-dom";

type User = { id: string, username?: string, avatarURL?: string }

type Server = {
    id?: string,
    perms?: 0|1|2|3,
    name?: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig?: { [key: string]: any },
    users: User[],
}

const ServerDashboard: FunctionComponent = () => {
    const [serverInfo, setServerInfo] = useState({} as Server);
    const [status, setStatus] = useState('');

    const [changed, setChanged] = useState({} as { prefix?: boolean, prefixAllowSpace?: boolean });
    const [prefix, setPrefix] = useState('' as string|undefined);
    const [prefixAllowSpace, setPrefixAllowSpace] = useState(false);
    
    const [botManagers, setBotManagers] = useState([] as string[]);
    const [moderators, setModerators] = useState([] as string[]);

    const { serverid } = useParams();

    const saveConfig = useCallback(async () => {
        if (Object.values(changed).filter(i => i).length == 0) return;

        const payload = {
            ...(changed.prefix ? { prefix } : undefined),
            ...(changed.prefixAllowSpace ? { spaceAfterPrefix: prefixAllowSpace } : undefined),
        }

        const res = await axios.put(
            API_URL + `/dash/server/${serverid}/config`,
            payload,
            { headers: await getAuthHeaders() }
        );

        if (res.data.success) {
            setChanged({});
        }
    }, [ prefix, prefixAllowSpace, changed ]);

    const loadInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/dash/server/${serverid}`, { headers: await getAuthHeaders() });
            console.log(res.data);
            
            const server: Server = res.data.server;
            setServerInfo(server);

            setPrefix(server.serverConfig?.prefix || '');
            setPrefixAllowSpace(!!server.serverConfig?.spaceAfterPrefix);

            setBotManagers(server.serverConfig?.botManagers ?? []);
            setModerators(server.serverConfig?.moderators ?? []);
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
                <div style={{ paddingLeft: '10px', paddingRight: '10px' }}>
                    <H3>Prefix</H3>
                    <InputBox
                        style={{ width: '150px', }}
                        placeholder="Enter a prefix..."
                        value={prefix}
                        onChange={e => {
                            setPrefix(e.currentTarget.value);
                            setChanged({ ...changed, prefix: true });
                        }}
                    />
                    <Checkbox
                        style={{ maxWidth: '400px' }}
                        value={prefixAllowSpace}
                        onChange={() => {
                            setPrefixAllowSpace(!prefixAllowSpace);
                            setChanged({ ...changed, prefixAllowSpace: true });
                        }}
                        title="Allow space after prefix"
                        description={'Whether the bot recognizes a command if the prefix is followed by a space. Enable if your prefix is a word.'}
                    />
                    <Button
                        style={{ marginTop: "16px" }}
                        onClick={saveConfig}
                    >Save</Button>

                    <LineDivider />

                    <H3>Bot Managers</H3>
                    <H4>
                        Only users with "Manage Server" permission are allowed to add/remove other
                        bot managers and are automatically considered bot manager.
                    </H4>
                    <UserListTypeContainer>
                        <UserListContainer disabled={(serverInfo.perms ?? 0) < 3}>
                            {botManagers.map((uid: string) => {
                                const user = serverInfo.users.find(u => u.id == uid) || { id: uid }
                                return (
                                    <UserListEntry type='MANAGER' user={user} key={uid} />
                                )})}
                            <UserListAddField type='MANAGER' />
                        </UserListContainer>
                    </UserListTypeContainer>

                    <H3>Moderators</H3>
                    <H4>
                        Only bot managers are allowed to add/remove moderators.
                        All bot managers are also moderators.
                    </H4>
                    <UserListTypeContainer>
                        <UserListContainer disabled={(serverInfo.perms ?? 0) < 2}>
                            {moderators.map((uid: string) => {
                                const user = serverInfo.users.find(u => u.id == uid) || { id: uid }
                                return (
                                    <UserListEntry type='MOD' user={user} key={uid} />
                                )})}
                            <UserListAddField type='MOD' />
                        </UserListContainer>
                    </UserListTypeContainer>
                </div>
            </div>
        </>
    );

    function UserListEntry(props: { user: User, type: 'MANAGER'|'MOD' }) {
        return (
            <div
                key={props.user.id}
                style={{
                    display: 'block',
                    margin: '4px 6px',
                    padding: '4px',
                    backgroundColor: 'var(--tertiary-background)',
                    borderRadius: '5px',
                }}
            >
                <img
                    src={props.user.avatarURL ?? 'https://amogus.org/amogus.png'}
                    width={28}
                    height={28}
                    style={{
                        borderRadius: '50%',
                        verticalAlign: 'middle',
                        display: 'inline-block',
                    }}
                />
                <span
                    style={{
                        color: 'var(--foreground)',
                        fontSize: '20px',
                        paddingLeft: '6px',
                        marginBottom: '2px',
                        verticalAlign: 'middle',
                        display: 'inline-block',
                    }}
                >{props.user.username ?? 'Unknown'}</span>
                <div
                    style={{
                        marginLeft: '4px',
                        verticalAlign: 'middle',
                        display: 'inline-block',
                        height: '30px',
                    }}
                    onClick={async () => {
                        const res = await axios.delete(
                            `${API_URL}/dash/server/${serverid}/${props.type == 'MANAGER' ? 'managers' : 'mods'}/${props.user.id}`,
                            { headers: await getAuthHeaders() }
                        );

                        if (props.type == 'MANAGER') {
                            setBotManagers(res.data.managers);
                        }
                        else if (props.type == 'MOD') {
                            setModerators(res.data.mods);
                        }
                    }}
                >
                    <Icon  // todo: hover effect
                        path={mdiCloseBox}
                        color='var(--tertiary-foreground)'
                        size='30px'
                    />
                </div>
            </div>
        );
    }
    
    function UserListContainer(props: { disabled: boolean, children: any }) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    ...(props.disabled ? {
                        filter: 'grayscale(100%)',
                        pointerEvents: 'none',
                    } : {})
                }}
            >
                {props.children}
            </div>
        );
    }

    function UserListTypeContainer(props: any) {
        return (
            <div
                style={{
                    display: 'flex',
                    backgroundColor: 'var(--secondary-background)',
                    borderRadius: '10px',
                    marginTop: '15px',
                    paddingTop: '5px',
                    paddingBottom: '5px',
                }}
            >{props.children}</div>
        );
    }

    function UserListAddField(props: { type: 'MANAGER'|'MOD' }) {
        const [content, setContent] = useState('');

        const onConfirm = useCallback(async () => {
            if (content.length) {
                const res = await axios.put(
                    `${API_URL}/dash/server/${serverid}/${props.type == 'MANAGER' ? 'managers' : 'mods'}`,
                    { item: content },
                    { headers: await getAuthHeaders() }
                );

                if (res.data.users?.length) {
                    res.data.users.forEach((user: User) => {
                        if (!serverInfo.users.find(u => u.id == user.id)) serverInfo.users.push(user);
                    });
                }

                if (props.type == 'MANAGER') {
                    setBotManagers(res.data.managers);
                }
                else if (props.type == 'MOD') {
                    setModerators(res.data.mods);
                }
            }
        }, [content]);

        return (
            <div>
                <InputBox
                    placeholder={`Add a ${props.type == 'MANAGER' ? 'bot manager' : 'moderator'}...`}
                    value={content}
                    onChange={e => setContent(e.currentTarget.value)}
                    style={{
                        float: 'left',
                        width: '180px',
                        height: '38px',
                        margin: '4px 8px',
                    }}
                    onKeyDown={e => e.key == 'Enter' && onConfirm()}
                />
                <Button
                    style={{
                        float: 'left',
                        width: '40px',
                        height: '38px',
                        margin: '4px 8px',
                    }}
                    onClick={onConfirm}
                >Ok</Button>
            </div>
        );
    }
}
export default ServerDashboard;
