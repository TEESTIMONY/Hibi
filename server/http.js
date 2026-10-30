export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

export async function readBody(request, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'That upload is too large. Use up to 12 MB of source files.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Expected a JSON request.');
  }
  try { return JSON.parse((await readBody(request)).toString('utf8')); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request is not valid JSON.');
  }
}

export function assertSameOrigin(request) {
  const host = request.headers.host;
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host ?? '')) {
    throw new HttpError(403, 'This local server only accepts localhost requests.');
  }
  if (request.headers.origin && request.headers.origin !== `http://${host}`) {
    throw new HttpError(403, 'Open this request from Hibi itself.');
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    throw new HttpError(403, 'Cross-site API requests are not allowed.');
  }
}
