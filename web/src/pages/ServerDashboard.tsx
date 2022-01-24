import localforage from "localforage";
import axios from 'axios';
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { Button } from '@revoltchat/ui/lib/components/atoms/inputs/Button';
import { InputBox } from '@revoltchat/ui/lib/components/atoms/inputs/InputBox';
import { H1 } from '@revoltchat/ui/lib/components/atoms/heading/H1';
import { H2 } from '@revoltchat/ui/lib/components/atoms/heading/H2';
import { API_URL } from "../App";
import { getAuthHeaders } from "../utils";
import { useParams } from "react-router-dom";

type Server = { id: string, perms: 0|1|2, name: string, iconURL?: string, bannerURL?: string }

const ServerDashboard: FunctionComponent = () => {
    const { serverid } = useParams();

    return (
        <a>sus</a>
    );
}

export default ServerDashboard;
