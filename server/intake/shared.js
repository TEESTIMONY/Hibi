import { randomUUID } from 'node:crypto';
import { readBody, HttpError } from '../http.js';
import { validateIntake } from './sources.js';

export function createShareInbox() {
  const pending = new Map();
  function prune() {
    for (const [token, value] of pending) if (value.expires < Date.now()) pending.delete(token);
  }

  async function receive(request) {
    prune();
    if (pending.size >= 20) throw new HttpError(429, 'Too many pending shares. Open Hibi and try again.');
    const bytes = await readBody(request);
    let form;
    try {
      form = await new Request('http://localhost/share', {
        method: 'POST', headers: { 'Content-Type': request.headers['content-type'] ?? '' }, body: bytes,
      }).formData();
    } catch { throw new HttpError(400, 'Could not read this shared content. Try pasting or uploading it.'); }
    const text = ['title', 'text', 'url'].map((key) => form.get(key)).filter((value) => typeof value === 'string' && value.trim()).join('\n\n');
    const files = [];
    for (const file of form.getAll('files')) {
      if (typeof file === 'string') continue;
      files.push({ name: file.name, data: Buffer.from(await file.arrayBuffer()).toString('base64') });
    }
    validateIntake({ text, files });
    const token = randomUUID();
    pending.set(token, { text, files, expires: Date.now() + 10 * 60 * 1000 });
    return token;
  }

  function consume(token) {
    prune();
    const shared = pending.get(token);
    if (!shared) throw new HttpError(404, 'This share expired or was already opened. Share it again.');
    pending.delete(token);
    return { text: shared.text, files: shared.files };
  }

  return { receive, consume };
}
