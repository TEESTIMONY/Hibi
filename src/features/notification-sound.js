// Original Hibi two-note chime. Audio permission is unlocked by an explicit tap.
export function createNotificationSound({ isReady }) {
  const key = 'hibi-chime-enabled';
  const audio = new Audio('/sounds/hibi-chime.wav');
  audio.preload = 'auto';
  let enabled = false;
  try { enabled = localStorage.getItem(key) === 'true'; } catch {}
  async function play() {
    if (!isReady() || document.visibilityState !== 'visible') return false;
    try { audio.currentTime = 0; await audio.play(); return true; }
    catch { return false; }
  }
  navigator.serviceWorker?.addEventListener('message', async (event) => {
    if (event.data?.type !== 'hibi-play-chime') return;
    event.ports[0]?.postMessage({ played: enabled && await play() });
  });
  return {
    get enabled() { return enabled; },
    async setEnabled(value) {
      if (value && !await play()) return false;
      enabled = value;
      try { localStorage.setItem(key, String(value)); } catch {}
      return true;
    },
    preview: play,
  };
}
