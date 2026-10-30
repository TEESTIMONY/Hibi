// Receive phone shares entirely in the browser: Vercel serves static assets only.
const DATABASE = 'hibi-incoming-shares';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function storeShare(record) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'token' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Shared content could not be stored.'));
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('pending', 'readwrite');
      const store = transaction.objectStore('pending');
      const existing = store.getAll();
      existing.onsuccess = () => {
        const retained = existing.result.filter((item) => item.expires >= Date.now()).sort((a, b) => b.expires - a.expires).slice(0, 4);
        const keep = new Set(retained.map((item) => item.token));
        existing.result.forEach((item) => { if (!keep.has(item.token)) store.delete(item.token); });
        store.put(record);
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('Shared content could not be stored.'));
    });
  } finally { db.close(); }
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const text = ['title', 'text', 'url'].map((key) => form.get(key)).filter((value) => typeof value === 'string' && value.trim()).join('\n\n');
    const files = form.getAll('files').filter((file) => typeof file !== 'string');
    const extensions = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'mp3', 'mp4', 'm4a', 'wav', 'webm', 'mpeg']);
    if ((!text && !files.length) || text.length > 60000 || files.length > 8
      || files.some((file) => !file.size || file.size > 8 * 1024 * 1024 || !extensions.has(file.name.split('.').pop().toLowerCase()))
      || files.reduce((sum, file) => sum + file.size, 0) > 12 * 1024 * 1024) {
      throw new Error('Unsupported share. Use text or supported files: up to 8 files, 8 MB each, 12 MB total.');
    }
    const token = crypto.randomUUID();
    await storeShare({ token, text, files, expires: Date.now() + 10 * 60 * 1000 });
    return Response.redirect(new URL(`/?share=${token}`, self.location.origin), 303);
  } catch {
    return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hibi share</title><p>This share could not be opened. Use supported files under 8 MB each and 12 MB total.</p><a href="/">Open Hibi and try uploading instead</a>', { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(receiveShare(event.request));
  }
});
