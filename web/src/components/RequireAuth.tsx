import { FunctionComponent, useState, useEffect } from "react";
import Login from "../pages/Login";
import { getAuth } from "../utils";

const RequireAuth: FunctionComponent = (props) => {
    const [loggedIn, setLoggedIn] = useState(true);

    useEffect(() => {
        getAuth().then(res => setLoggedIn(!!res));
    });

    return loggedIn ? <>{props.children}</> : <Login />
}

export default RequireAuth;
