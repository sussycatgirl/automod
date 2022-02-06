class PendingLogin {
    user: string;
    code: string;
    expires: number;
    nonce: string;
    confirmed: boolean;
    requirePhishingConfirmation: boolean;
    exchanged: boolean;
    invalid: boolean;
}

export default PendingLogin;
