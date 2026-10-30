import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { createOpenAI } from './ai/openai.js';
import { createShareInbox } from './intake/shared.js';
import { validateIntake } from './intake/sources.js';
import { assertSameOrigin, HttpError, readJson, sendJson } from './http.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export function createApp({ root = resolve('.'), config, ai = createOpenAI(config), shares = createShareInbox() }) {
  let activeRequests = 0;

  return async function handle(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/share' && request.method === 'POST') {
        const token = await shares.receive(request);
        response.writeHead(303, { Location: `/?share=${token}`, 'Cache-Control': 'no-store' }).end();
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        assertSameOrigin(request);
        if (url.pathname === '/api/ai/status' && request.method === 'GET') {
          sendJson(response, 200, { configured: Boolean(config.apiKey), provider: 'OpenAI', model: config.model });
          return;
        }
        if (url.pathname.startsWith('/api/shared/') && request.method === 'GET') {
          sendJson(response, 200, shares.consume(url.pathname.slice('/api/shared/'.length)));
          return;
        }
        if (url.pathname === '/api/ai/plan' && request.method === 'POST') {
          if (!config.apiKey) throw new HttpError(503, 'Connect OpenAI first: add OPENAI_API_KEY to .env and restart Hibi.');
          if (activeRequests >= 2) throw new HttpError(429, 'Hibi is already working on a plan. Please wait.');
          activeRequests++;
          try { sendJson(response, 200, await ai.suggestPlan(validateIntake(await readJson(request)))); }
          finally { activeRequests--; }
          return;
        }
        throw new HttpError(404, 'API route not found.');
      }

      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      const pathname = decodeURIComponent(url.pathname);
      const segments = pathname.split('/').filter(Boolean);
      const publicFiles = ['manifest.webmanifest', 'sw.js', 'icon.svg'];
      const allowed = segments.length === 0 || pathname === '/index.html' || segments[0] === 'src' || publicFiles.includes(pathname.slice(1));
      if (!allowed || segments.some((part) => part.startsWith('.'))) throw new HttpError(404, 'Not found.');
      const publicPath = publicFiles.includes(pathname.slice(1)) ? `/public${pathname}` : pathname;
      const file = resolve(root, `.${publicPath === '/' ? '/index.html' : publicPath}`);
      const local = relative(root, file);
      if (local.startsWith('..') || isAbsolute(local) || !(await stat(file)).isFile()) throw new HttpError(404, 'Not found.');
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const status = error instanceof HttpError ? error.status : error.code === 'ENOENT' ? 404 : 500;
      sendJson(response, status, { error: status === 500 ? 'Hibi could not complete this request.' : error.message });
    }
  };
}
