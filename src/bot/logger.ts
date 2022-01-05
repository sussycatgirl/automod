import Log75, { LogLevel } from 'log75';

// Thanks to being forced to switch to ESM this broke somehow?
let logger: Log75 = new (Log75 as any).default(process.env.NODE_ENV == 'production' ? LogLevel.Standard : LogLevel.Debug);

export default logger;
