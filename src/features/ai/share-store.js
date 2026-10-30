const DATABASE = 'hibi-incoming-shares';

export async function consumeLocalShare(token) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'token' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Shared content is not available in this browser.'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('pending', 'readwrite');
      const store = transaction.objectStore('pending');
      let shared;
      const request = store.get(token);
      request.onsuccess = () => {
        shared = request.result;
        store.delete(token);
      };
      transaction.oncomplete = () => {
        if (!shared || shared.expires < Date.now()) reject(new Error('This share expired or was already opened. Share it again.'));
        else resolve({ text: shared.text, files: shared.files });
      };
      transaction.onerror = () => reject(new Error('Could not open the shared content.'));
    });
  } finally { db.close(); }
}
