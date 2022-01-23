import { Request, Response } from "express";
import { app, logger } from "..";

app.use('*', (req: Request, res: Response, next: () => void) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
});
