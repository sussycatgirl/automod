class CustomRuleAction {
    _id: string;

    // The action to perform on the user/message
    // todo: kick and ban are not implemented, either remove them or implement them
    action: 'delete' | 'warn' | 'kick' | 'ban' | 'sendMessage';

    // If the action accepts a text parameter, this is it
    text?: string;

    // If the action accepts a duration parameter, this is it
    // sendMessage will delete the message after the duration
    // delete/kick/ban will wait for the duration to pass
    duration?: number;

    // Whether to send the action in chat. Off by default.
    // Not supported by sendMessage
    silent?: boolean;
}

export default CustomRuleAction;
