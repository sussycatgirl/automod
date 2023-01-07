export const CONFIG_KEYS = {
    bridge_nicknames: {
        friendlyName: "Bridge Nicknames",
        description:
            "If enabled, nicknames and avatar overrides will be bridged.",
    },
    disallow_opt_out: {
        friendlyName: "Disallow users who opted out of message bridging",
        description:
            "If enabled, all messages by users who opted out of their messages being bridged (`/bridge opt_out`) will be deleted. " +
            "You should enable this if your Revolt server is bridged to a mostly unmoderated Discord server.",
    },
    disable_system_messages: {
        friendlyName: "Don't bridge system messages",
        description:
            "If enabled, system messages (e.g. join/leave events) won't be bridged.",
    },
    read_only_revolt: {
        friendlyName: "Revolt read only",
        description: "Don't bridge Revolt messages to Discord",
    },
    read_only_discord: {
        friendlyName: "Discord read only",
        description: "Don't bridge Discord messages to Revolt",
    },
};
