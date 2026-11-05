import { API_BASE_URL } from '../config.js';
import { apiRequest, hasAPISession } from './ai/api.js';
import { createNotificationSound } from './notification-sound.js';

export function decodePushKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (letter) => letter.charCodeAt(0));
}

export function createNotifications({ isReady, getUserId }) {
  const section = document.createElement('section');
  section.className = 'notification-settings';
  section.innerHTML = `<h3>Notifications</h3><p role="status">Checking this device…</p>
    <button type="button" data-push="enable" disabled>Enable notifications</button>
    <button type="button" data-push="test" disabled>Send test notification</button>
    <button type="button" data-push="disable" disabled>Disable on this device</button>
    <label><input type="checkbox" data-chime> Hibi chime while the app is open</label>
    <button type="button" data-chime-preview>Preview Hibi chime</button>
    <small>Tap to enable sound on this device. When Hibi is closed, your phone controls the notification sound.</small>
    <small>On iPhone, add Hibi to your Home Screen and open it from there first. Reminders use generic text on your lock screen.</small>`;
  document.querySelector('#account-tools').prepend(section);
  const message = section.querySelector('p');
  const sound = createNotificationSound({ isReady });
  const chime = section.querySelector('[data-chime]');
  chime.checked = sound.enabled;
  chime.addEventListener('change', async () => {
    if (!await sound.setEnabled(chime.checked)) {
      chime.checked = sound.enabled;
      message.textContent = 'Sound could not play. Tap Preview Hibi chime and try again.';
    }
  });
  section.querySelector('[data-chime-preview]').addEventListener('click', async () => {
    if (!await sound.preview()) message.textContent = 'Sound could not play. Check your device’s audio settings.';
  });
  const enable = section.querySelector('[data-push=enable]');
  const test = section.querySelector('[data-push=test]');
  const disable = section.querySelector('[data-push=disable]');
  const ownerKey = `hibi-push-owner:${API_BASE_URL}`;
  const native = globalThis.Capacitor?.isNativePlatform() === true;
  const supported = () => !native && globalThis.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;
  let config = null;
  let busy = false;
  let generation = 0;
  let subscription = null;
  function buttons() {
    enable.disabled = busy || !isReady() || !supported() || !config?.configured || Notification.permission === 'denied';
    test.disabled = busy || !isReady() || !subscription;
    disable.disabled = busy || !isReady() || !subscription;
  }
  async function registration() {
    await navigator.serviceWorker.register('/sw.js');
    return navigator.serviceWorker.ready;
  }
  async function refresh() {
    const version = ++generation;
    if (!isReady()) return;
    if (!supported()) {
      message.textContent = native ? 'Mobile notification delivery is the next stage. You can preview the Hibi chime below.'
        : 'Push is unavailable here. On iPhone, install Hibi on the Home Screen and open that app.';
      buttons(); return;
    }
    try {
      config = await apiRequest('/api/notifications/config');
      const worker = await registration();
      const current = await worker.pushManager.getSubscription();
      if (version !== generation || !isReady()) return;
      const owner = localStorage.getItem(ownerKey);
      if (current && owner !== String(getUserId())) {
        await current.unsubscribe();
        localStorage.removeItem(ownerKey);
        subscription = null;
      } else subscription = current;
      message.textContent = !config.configured ? 'Notifications will be available after the server is configured.'
        : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in this site’s browser settings to continue.'
        : subscription ? 'Notifications are enabled on this device.' : 'Enable reminders on this device.';
    } catch (error) { message.textContent = error.message; }
    buttons();
  }
  async function run(action) {
    if (!isReady() || busy) return;
    busy = true; buttons();
    try { await action(); }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; buttons(); }
  }
  enable.addEventListener('click', () => {
    if (!config?.configured || !supported() || !isReady()) return;
    const owner = getUserId();
    // Ask immediately in the user's click gesture, before waiting for registration/network.
    const permission = Notification.requestPermission();
    void run(async () => {
      if (await permission !== 'granted') { message.textContent = 'Notifications were not enabled. You can try again from this panel.'; return; }
      if (!isReady() || owner !== getUserId()) return;
      const worker = await registration();
      subscription = await worker.pushManager.getSubscription();
      const key = decodePushKey(config.publicKey);
      if (subscription && subscription.options.applicationServerKey &&
          String(new Uint8Array(subscription.options.applicationServerKey)) !== String(key)) {
        await apiRequest('/api/notifications/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe(); subscription = null;
      }
      subscription ||= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      if (!isReady() || owner !== getUserId()) { await subscription.unsubscribe(); subscription = null; return; }
      await apiRequest('/api/notifications/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
      localStorage.setItem(ownerKey, String(owner));
      message.textContent = 'Notifications are enabled. Send a test to check delivery.';
    });
  });
  test.addEventListener('click', () => void run(async () => {
    await apiRequest('/api/notifications/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    message.textContent = 'Test accepted by the push service. Check your device’s notifications.';
  }));
  disable.addEventListener('click', () => void run(async () => {
    const current = subscription;
    try {
      await apiRequest('/api/notifications/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: current.endpoint }) });
    } finally {
      await current.unsubscribe(); subscription = null; localStorage.removeItem(ownerKey);
      message.textContent = 'Notifications are disabled on this device.';
    }
  }));
  globalThis.addEventListener('hibi-workspace-ready', () => { void refresh(); });
  globalThis.addEventListener('hibi-session-changed', () => {
    generation++;
    if (!hasAPISession() && supported()) {
      void navigator.serviceWorker.getRegistration().then(async (worker) => {
        const current = await worker?.pushManager.getSubscription();
        if (current) await current.unsubscribe();
        localStorage.removeItem(ownerKey);
      }).catch(() => {});
      subscription = null;
    }
    buttons();
  });
  if (isReady()) void refresh();
}
