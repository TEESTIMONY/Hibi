// Receive phone shares entirely in the browser: Vercel serves static assets only.
const DATABASE = 'hibi-incoming-shares';
async function playForegroundChime() {
  const windows = await self.clients.matchAll({ type: 'window' });
  const visible = windows.find((client) => client.visibilityState === 'visible');
  if (!visible) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 700);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer); channel.port1.close(); resolve(event.data?.played === true);
    };
    visible.postMessage({ type: 'hibi-play-chime' }, [channel.port2]);
  });
}
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch {}
    const played = await playForegroundChime();
    await self.registration.showNotification(String(payload.title || 'Hibi').slice(0, 100), {
      body: String(payload.body || 'Open Hibi to see your update.').slice(0, 250),
      icon: '/icon.svg', tag: String(payload.tag || 'hibi-update').slice(0, 100),
      silent: played,
      data: { taskId: typeof payload.taskId === 'string' ? payload.taskId : '' },
    });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/', self.location.origin);
    const taskId = event.notification.data?.taskId;
    if (taskId) url.searchParams.set('task', taskId);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(url.href);
  })());
});
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
