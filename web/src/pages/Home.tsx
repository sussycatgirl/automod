import { FunctionComponent } from "react";
import { Link } from "react-router-dom";

const Home: FunctionComponent = () => {
    return (
        <div style={{ marginLeft: '12px' }}>
            <div style={{ display: 'flex', padding: '16px 0' }}>
                <img src='/src/favicon.svg' style={{ height: '40px' }} />
                <h1 style={{ color: 'var(--foreground)', margin: '0', paddingLeft: '8px' }}>Automod Web UI</h1>
            </div>

            <span style={{ color: 'var(--foreground)' }}>
                This is a <b>work-in-progress</b> Web UI for the Automod Revolt bot.
                <br />
                <Link to='/dashboard'>
                    Open Dashboard
                </Link> or <a href="https://app.revolt.chat/bot/01FHGJ3NPP7XANQQH8C2BE44ZY" target='_blank'>
                    add the bot to your server.
                </a>
            </span>
        </div>
    );
}

export default Home;
