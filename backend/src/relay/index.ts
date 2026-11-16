import { createRelayApp } from './app';

const port = Number(process.env.PORT ?? 3003);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createRelayApp().listen(port, '0.0.0.0');
process.once('SIGTERM', () => { server.close(() => process.exit(0)); });
process.once('SIGINT', () => { server.close(() => process.exit(0)); });
