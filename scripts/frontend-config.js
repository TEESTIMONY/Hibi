import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export function getPublicConfig(env = process.env) {
  const base = env.HIBI_API_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
  if (base) {
    const url = new URL(base);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
      throw new Error('HIBI_API_BASE_URL must be a plain origin, for example https://api.example.com');
    }
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      throw new Error('Use HTTPS for a deployed Django API. HTTP is allowed only on localhost.');
    }
  }
  return { apiBaseUrl: base };
}

export function renderPublicConfig(config) {
  return `// Generated public frontend settings. Never include server secrets here.\nexport const API_BASE_URL = ${JSON.stringify(config.apiBaseUrl)};\n`;
}
