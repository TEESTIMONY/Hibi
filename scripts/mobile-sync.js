import { spawnSync } from 'node:child_process';
import { getPublicConfig } from './frontend-config.js';
const config = getPublicConfig();
if (!config.apiBaseUrl || ['localhost', '127.0.0.1'].includes(new URL(config.apiBaseUrl).hostname)) {
  throw new Error('Set HIBI_API_BASE_URL to your public HTTPS Django API before packaging for a phone.');
}
for (const args of [['scripts/build.js'], ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
