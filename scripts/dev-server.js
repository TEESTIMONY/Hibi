import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { getPublicConfig, renderPublicConfig } from './frontend-config.js';

// This process serves only frontend assets. Run Django separately on port 8000.
const built = process.argv.includes('--dist');
const root = resolve(built ? 'dist' : '.');
const port = Number(process.env.PORT || 5173);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end('Frontend only. The API runs in Django.'); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!built && pathname === '/src/config.js') {
      response.writeHead(200, { 'Content-Type': contentTypes['.js'], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : renderPublicConfig(getPublicConfig()));
      return;
    }
    const publicFiles = ['manifest.webmanifest', 'sw.js', 'icon.svg'];
    const pieces = pathname.split('/').filter(Boolean);
    if (!(pathname === '/' || pathname === '/index.html' || pieces[0] === 'src' || publicFiles.includes(pathname.slice(1))) || pieces.some((piece) => piece.startsWith('.'))) {
      response.writeHead(404).end('Not found'); return;
    }
    const mapped = !built && publicFiles.includes(pathname.slice(1)) ? `/public${pathname}` : pathname;
    const file = resolve(root, `.${mapped === '/' ? '/index.html' : mapped}`);
    const local = relative(root, file);
    if (local.startsWith('..') || isAbsolute(local) || !(await stat(file)).isFile()) { response.writeHead(404).end('Not found'); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404).end('Not found'); }
});
server.on('error', (error) => { console.error(`Could not start Hibi UI: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Hibi UI: http://127.0.0.1:${port}`));
