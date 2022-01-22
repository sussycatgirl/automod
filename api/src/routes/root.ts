import { app } from '..';
import { Request, Response } from 'express';

app.get('/', (req: Request, res: Response) => {
    res.send({ msg: "yo" });
});