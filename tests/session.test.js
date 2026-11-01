import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/services/session.js';

function memory() {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test('sign-in survives a new tab/session store instead of depending on sessionStorage', () => {
  const persistent = memory();
  createSessionStore('https://api.example', { persistent, legacy: memory() }).set('test-token');
  const reopened = createSessionStore('https://api.example', { persistent, legacy: memory() });
  assert.equal(reopened.get(), 'test-token');
  assert.equal(createSessionStore('https://other-api.example', { persistent, legacy: memory() }).get(), '');
});

test('existing tab tokens migrate without making the user log in again', () => {
  const persistent = memory(); const legacy = memory();
  const session = createSessionStore('https://api.example', { persistent, legacy });
  legacy.setItem(session.key, 'old-tab-token');
  assert.equal(session.get(), 'old-tab-token');
  assert.equal(persistent.getItem(session.key), 'old-tab-token');
  assert.equal(legacy.getItem(session.key), null);
});

test('an old unauthorized response cannot clear a newer login', () => {
  const session = createSessionStore('https://api.example', { persistent: memory(), legacy: memory() });
  session.set('older'); session.set('newer');
  assert.equal(session.clear('older'), false);
  assert.equal(session.get(), 'newer');
  assert.equal(session.clear('newer'), true);
  assert.equal(session.get(), '');
});

test('storage failures and invalid login responses do not create a false signed-in state', () => {
  const broken = { getItem() { throw Error('Blocked'); }, setItem() { throw Error('Blocked'); } };
  const session = createSessionStore('https://api.example', { persistent: broken, legacy: memory() });
  assert.equal(session.get(), '');
  assert.throws(() => session.set('test-token'), /site storage/);
  assert.throws(() => session.set(undefined), /valid sign-in/);
});
