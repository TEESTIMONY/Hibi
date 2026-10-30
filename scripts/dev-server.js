import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { getConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

const config = getConfig();
const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const server = createServer(createApp({ root, config }));
server.on('error', (error) => {
  console.error(`Could not start Hibi: ${error.message}`);
  process.exitCode = 1;
});
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Hibi: http://127.0.0.1:${config.port}`);
  console.log(config.apiKey ? `AI: OpenAI (${config.model})` : 'AI: not connected. Configure .env to enable planning.');
});
