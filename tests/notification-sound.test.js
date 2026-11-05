import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationSound } from '../src/features/notification-sound.js';

test('chime acknowledges only successful foreground playback for a signed-in user', async () => {
  const originals = Object.fromEntries(['Audio', 'navigator', 'document', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let listener; let ready = true; let blocked = false; let played = 0;
  try {
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class { async play() { if (blocked) throw new Error('blocked'); played++; } } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { addEventListener: (_, handler) => { listener = handler; } } } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {} } });
    const sound = createNotificationSound({ isReady: () => ready });
    let acknowledged;
    const receive = () => listener({ data: { type: 'hibi-play-chime' }, ports: [{ postMessage: (value) => { acknowledged = value.played; } }] });
    await receive(); assert.equal(acknowledged, false);
    assert.equal(await sound.setEnabled(true), true);
    await receive(); assert.equal(acknowledged, true);
    blocked = true;
    await receive(); assert.equal(acknowledged, false);
    blocked = false; ready = false;
    await receive(); assert.equal(acknowledged, false);
    assert.equal(played, 2);
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
