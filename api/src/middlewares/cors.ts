import { Request, Response } from "express";
import { app, logger } from "..";

app.use('*', (req: Request, res: Response, next: () => void) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-auth-user, x-auth-token');
    res.header('Access-Control-Allow-Methods', '*');
    next();
});
