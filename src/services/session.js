// DRF tokens have no idle timeout. Keep the login until explicit logout or revocation.
export function createSessionStore(origin, storage = {}) {
  const key = `hibi-api-token:${origin}`;
  const persistent = () => storage.persistent ?? globalThis.localStorage;
  const legacy = () => storage.legacy ?? globalThis.sessionStorage;
  function get() {
    try {
      const saved = persistent().getItem(key);
      if (saved) return saved;
      const previous = legacy().getItem(key);
      if (previous) {
        persistent().setItem(key, previous);
        legacy().removeItem(key);
        return previous;
      }
    } catch { /* A blocked browser store must not expose another account or guest data. */ }
    return '';
  }
  function set(token) {
    if (typeof token !== 'string' || !token) throw Error('The server did not return a valid sign-in session.');
    try { persistent().setItem(key, token); legacy().removeItem(key); }
    catch { throw Error('Your browser could not keep you signed in. Enable site storage and try again.'); }
  }
  function clear(expected = get()) {
    if (get() !== expected) return false;
    try { persistent().removeItem(key); legacy().removeItem(key); } catch {}
    return true;
  }
  return { key, get, set, clear };
}
