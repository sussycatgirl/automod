import { app, logger, PORT } from ".";

const server = app.listen(PORT, () => logger.info(`Listening on port ${PORT}`));

export default server;
