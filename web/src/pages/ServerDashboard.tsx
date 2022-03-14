import axios from 'axios';
import React, { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { InputBox } from '@revoltchat/ui/lib/components/atoms/inputs/InputBox';
import { Checkbox } from '@revoltchat/ui/lib/components/atoms/inputs/Checkbox';
import { ComboBox } from '@revoltchat/ui/lib/components/atoms/inputs/ComboBox';
import { LineDivider } from '@revoltchat/ui/lib/components/atoms/layout/LineDivider';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H3 } from '@revoltchat/ui/lib/components/atoms/heading/H3';
import { H4 } from '@revoltchat/ui/lib/components/atoms/heading/H4';
import { Icon } from '@mdi/react';
import { mdiChevronLeft, mdiCloseBox } from '@mdi/js';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";
import { Link, useParams } from "react-router-dom";
import defaultChannelIcon from '../assets/channel-default-icon.svg';

type User = { id: string, username?: string, avatarURL?: string }
type Channel = { id: string, name: string, icon?: string, type: 'VOICE'|'TEXT', nsfw: boolean }

type Server = {
    id?: string,
    perms?: 0|1|2|3,
    name?: string,
    description?: string,
    iconURL?: string,
    bannerURL?: string,
    serverConfig?: { [key: string]: any },
    users: User[],
    channels: Channel[],
}

type AntispamRule = {
    id: string;
    max_msg: number;
    timeframe: number;
    action: 0|1|2|3|4;
    channels: string[] | null;
    message: string | null;
}

const ServerDashboard: FunctionComponent = () => {
    const [serverInfo, setServerInfo] = useState({} as Server);
    const [status, setStatus] = useState('');

    const [changed, setChanged] = useState({} as { prefix?: boolean, prefixAllowSpace?: boolean });
    const [prefix, setPrefix] = useState('' as string|undefined);
    const [prefixAllowSpace, setPrefixAllowSpace] = useState(false);
    
    const [botManagers, setBotManagers] = useState([] as string[]);
    const [moderators, setModerators] = useState([] as string[]);

    const [automodSettings, setAutomodSettings] = useState(null as { antispam: AntispamRule[] }|null);

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

            loadAutomodInfo(server);
        } catch(e: any) {
            console.error(e);
            setStatus(`${e?.message ?? e}`);
        }
    }, [serverInfo]);

    const loadAutomodInfo = useCallback(async (server: Server) => {
        if ((server.perms ?? 0) > 0) {
            const res = await axios.get(API_URL + `/dash/server/${serverid}/automod`, { headers: await getAuthHeaders() });
            setAutomodSettings(res.data);
            console.log(res.data);
        }
    }, []);

    useEffect(() => {
        loadInfo();
    }, []);

    return (
        <>
            <Link to='/dashboard'>
                <div style={{ display: 'flex', marginTop: '4px' }}>
                    <Icon path={mdiChevronLeft} style={{ height: '24px' }} />
                    <span>Back</span>
                </div>
            </Link>
            <H1 style={{ marginTop: '8px' }}>{serverInfo?.name ?? 'Loading...'}</H1>
            {status.length ? <a>{status}</a> : <br/>}
            <div hidden={Object.keys(serverInfo).length == 0}>
                <H4>{serverInfo.description ?? <i>No server description set</i>}</H4>
                <br/>
                <div style={{ paddingLeft: '10px', paddingRight: '10px' }}>
                    <>
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
                    </>

                    <LineDivider />

                    <>
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
                    </>

                    <LineDivider />

                    <>
                        <H3>Antispam Rules</H3>
                        {serverInfo.perms != null && automodSettings && (
                            serverInfo.perms > 0
                                ? (
                                    <>
                                        {automodSettings.antispam.map(r => <AntispamRule rule={r} key={r.id} />)}
                                        <Button style={{
                                            marginTop: '12px',
                                            marginBottom: '8px',
                                        }} onClick={async () => {
                                            const newRule: AntispamRule = {
                                                action: 0,
                                                max_msg: 5,
                                                timeframe: 3,
                                                message: null,
                                                id: '',
                                                channels: [],
                                            }

                                            const res = await axios.post(
                                                `${API_URL}/dash/server/${serverid}/automod`,
                                                {
                                                    action: newRule.action,
                                                    max_msg: newRule.max_msg,
                                                    timeframe: newRule.timeframe,
                                                },
                                                { headers: await getAuthHeaders() }
                                            );

                                            newRule.id = res.data.id;

                                            setAutomodSettings({ antispam: [ ...(automodSettings.antispam), newRule ] });
                                        }}>
                                            Create Rule
                                        </Button>
                                    </>
                                )
                                : (
                                    <div>
                                        <p style={{ color: 'var(--foreground)' }}>
                                            You do not have access to this.
                                        </p>
                                    </div>
                                )
                            )
                        }
                    </>
                </div>
            </div>
        </>
    );

    function RemoveButton(props: { onClick: () => void }) {
        return (
            <div
                style={{
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    display: 'inline-block',
                    height: '30px',
                }}
                onClick={props.onClick}
            >
                <Icon  // todo: hover effect
                    path={mdiCloseBox}
                    color='var(--tertiary-foreground)'
                    size='30px'
                />
            </div>
        )
    }

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
                <RemoveButton
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
                />
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

        const onConfirm = useCallback(async () => {0
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
                        opacity: content.length > 0 ? '1' : '0',
                    }}
                    onClick={onConfirm}
                >Ok</Button>
            </div>
        );
    }

    function ChannelListAddField(props: { onInput: (channel: Channel) => void }) {
        const [content, setContent] = useState('');

        const onConfirm = useCallback(async () => {
            if (content.length) {
                const channel = serverInfo.channels
                    .find(c => c.id == content.toUpperCase())
                    || serverInfo.channels
                    .find(c => c.name == content)
                    || serverInfo.channels                                     // Prefer channel with same capitalization,
                    .find(c => c.name.toLowerCase() == content.toLowerCase()); // otherwise search case insensitive
                
                if (channel && channel.type == 'TEXT') {
                    props.onInput(channel);
                    setContent('');
                }
            }
        }, [content]);

        return (
            <div>
                <InputBox
                    placeholder={`Add a channel...`}
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
                        opacity: content.length > 0 ? '1' : '0',
                    }}
                    onClick={onConfirm}
                >Ok</Button>
            </div>
        );
    }

    function AntispamRule(props: { rule: AntispamRule }) {
        const [maxMsg, setMaxMsg] = useState(props.rule.max_msg);
        const [timeframe, setTimeframe] = useState(props.rule.timeframe);
        const [action, setAction] = useState(props.rule.action);
        const [message, setMessage] = useState(props.rule.message || '');
        const [channels, setChannels] = useState(props.rule.channels ?? []);
        const [channelsChanged, setChannelsChanged] = useState(false);

        const save = useCallback(async () => {
            await axios.patch(
                `${API_URL}/dash/server/${serverid}/automod/${props.rule.id}`,
                {
                    action: action != props.rule.action ? action : undefined,
                    channels: channelsChanged ? channels : undefined,
                    max_msg: maxMsg != props.rule.max_msg ? maxMsg : undefined,
                    message: message != props.rule.message ? message : undefined,
                    timeframe: timeframe != props.rule.timeframe ? timeframe : undefined,
                } as AntispamRule,
                { headers: await getAuthHeaders() }
            );

            await loadAutomodInfo(serverInfo);
        }, [maxMsg, timeframe, action, message, channels, channelsChanged]);

        const reset = useCallback(() => {
            setMaxMsg(props.rule.max_msg);
            setTimeframe(props.rule.timeframe);
            setAction(props.rule.action);
            setMessage(props.rule.message || '');
            setChannels(props.rule.channels ?? []);
            setChannelsChanged(false);
        }, []);

        const remove = useCallback(async () => {
            if (confirm(`Do you want to irreversably delete rule ${props.rule.id}?`)) {
                await axios.delete(`${API_URL}/dash/server/${serverid}/automod/${props.rule.id}`, { headers: await getAuthHeaders() });
                setAutomodSettings({ antispam: automodSettings!.antispam.filter(r => r.id != props.rule.id) });
            }
        }, []);

        const inputStyle: React.CSSProperties = {
            maxWidth: '100px',
            margin: '8px 8px 0px 8px',
        }

        const messagePlaceholders = {
            0: '',
            1: 'Message content...',
            2: '(Optional) Warn reason...',
            3: '',
            4: '',
        }

        return (
            <div>
                <span
                    style={{
                        color: 'var(--foreground)',
                    }}
                >
                    <div style={{ marginTop: '12px' }}>
                        If user sends more than
                        <InputBox style={inputStyle} value={maxMsg  || ''} placeholder={`${props.rule.max_msg}`} onChange={e => {
                            const val = e.currentTarget.value;
                            if (!isNaN(Number(val)) && val.length <= 4 && Number(val) >= 0) setMaxMsg(Number(val));
                        }} />
                        messages in
                        <InputBox style={inputStyle} value={timeframe || ''} placeholder={`${props.rule.timeframe}`} onChange={e => {
                            const val = e.currentTarget.value;
                            if (!isNaN(Number(val)) && val.length <= 4 && Number(val) >= 0) setTimeframe(Number(val));
                        }} />
                        seconds,
                        <ComboBox
                            style={{ ...inputStyle, maxWidth: '200px' }}
                            value={action}
                            onChange={ev => setAction(ev.currentTarget.value as any)}
                        >
                            <option value={0}>Delete message</option>
                            <option value={1}>Send a message</option>
                            <option value={2}>Warn user</option>
                            <option value={3}>Kick user</option>
                            <option value={4}>Ban user</option>
                        </ComboBox>
                        <InputBox
                            style={{
                                ...inputStyle,
                                maxWidth: 'min(400px, calc(100% - 20px))',
                                display: action >= 3 || action == 0 ? 'none' : 'unset' }}
                            value={message}
                            placeholder={messagePlaceholders[action] || ''}
                            onChange={ev => setMessage(ev.currentTarget.value)}
                        />
                        <a style={{ display: action >= 3 ? 'unset' : 'none'}}>
                            <br/>
                            "Kick" and "Ban" actions are currently placeholders, they do not have any functionality yet.
                        </a>

                        <H4 style={{ paddingTop: '16px' }}>
                            You can specify channels here that this rule will run in.
                            If left empty, it will run in all channels.
                        </H4>
                        <UserListTypeContainer>
                            {
                                channels.map(cid => {
                                    const channel: Channel = serverInfo.channels.find(c => c.id == cid && c.type == 'TEXT')
                                        || { id: cid, name: 'Unknown channel', nsfw: false, type: 'TEXT' };
                                    return (
                                        <div
                                            key={cid}
                                            style={{
                                                display: 'block',
                                                margin: '4px 6px',
                                                padding: '4px',
                                                backgroundColor: 'var(--tertiary-background)',
                                                borderRadius: '5px',
                                            }}
                                        >
                                            <img
                                                src={channel.icon ?? defaultChannelIcon}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    objectFit: 'cover',
                                                    borderRadius: '10%',
                                                    verticalAlign: 'middle',
                                                    display: 'inline-block',
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: '20px',
                                                    verticalAlign: 'middle',
                                                    marginLeft: '4px',
                                                }}
                                            >{channel.name}</span>
                                            <RemoveButton onClick={() => {
                                                setChannels(channels.filter(c => c != cid));
                                                setChannelsChanged(true);
                                            }} />
                                        </div>
                                    )
                                })
                            }
                            <ChannelListAddField onInput={channel => {
                                if (!channels.includes(channel.id)) {
                                    setChannels([ ...channels, channel.id ]);
                                    setChannelsChanged(true);
                                }
                            }} />
                        </UserListTypeContainer>
                    </div>
                </span>
                <div
                    style={{
                        paddingTop: '16px'
                    }}
                >
                    <Button style={{ float: 'left' }} onClick={save}>Save</Button>
                    <Button style={{ float: 'left', marginLeft: '8px' }} onClick={reset}>Reset</Button>
                    <Button style={{ float: 'left', marginLeft: '8px' }} onClick={remove}>Delete</Button>
                    <div style={{ clear: 'both' }} />
                </div>
            </div>
        )
    }
}
export default ServerDashboard;
