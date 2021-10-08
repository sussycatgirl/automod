import Log75, { LogLevel } from 'log75';

let logger = new Log75(process.env.NODE_ENV == 'production' ? LogLevel.Standard : LogLevel.Debug);

export default logger;
