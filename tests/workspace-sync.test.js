import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceSync } from '../src/services/workspace-sync.js';
const empty = { revision: 0, tasks: [], projects: ['Personal'], dirty: false };

test('edits during an in-flight save are sent next with the acknowledged revision', async () => {
  let release;
  const requests = [];
  const sync = createWorkspaceSync({ initial: empty, persist() {}, onStatus() {}, send: async (body) => {
    requests.push(structuredClone(body));
    if (requests.length === 1) await new Promise((resolve) => { release = resolve; });
    return { revision: body.revision + 1 };
  } });
  sync.edit({ tasks: [{ title: 'First' }], projects: ['Personal'] });
  const first = sync.flush();
  sync.edit({ tasks: [{ title: 'Second' }], projects: ['Personal'] });
  assert.equal(sync.flush(), first);
  release();
  assert.equal(await first, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].revision, 1);
  assert.equal(requests[1].tasks[0].title, 'Second');
  assert.equal(sync.snapshot().dirty, false);
});

test('offline failure preserves pending changes and retries successfully', async () => {
  let offline = true;
  const sync = createWorkspaceSync({ initial: empty, persist() {}, onStatus() {}, send: async () => {
    if (offline) throw new Error('Offline');
    return { revision: 1 };
  } });
  sync.edit({ tasks: [{ title: 'Keep me' }], projects: ['Personal'] });
  assert.equal(await sync.flush(), false);
  assert.equal(sync.snapshot().dirty, true);
  offline = false;
  assert.equal(await sync.flush(), true);
  assert.equal(sync.snapshot().tasks[0].title, 'Keep me');
});

test('conflict blocks further network saves and retains the pending copy', async () => {
  let calls = 0;
  const sync = createWorkspaceSync({ initial: empty, persist() {}, onStatus() {}, send: async () => {
    calls++; throw Object.assign(new Error('Conflict'), { status: 409 });
  } });
  sync.edit({ tasks: [{ title: 'Pending' }], projects: ['Personal'] });
  await sync.flush(); await sync.flush();
  assert.equal(calls, 1);
  assert.equal(sync.snapshot().dirty, true);
});

test('local storage failure refuses an edit before changing sync state', () => {
  const sync = createWorkspaceSync({ initial: empty, persist() { throw Error('Full'); }, onStatus() {}, send() {} });
  assert.throws(() => sync.edit({ tasks: [{ title: 'Unsaved' }], projects: [] }), /Full/);
  assert.equal(sync.snapshot().dirty, false);
  assert.deepEqual(sync.snapshot().tasks, []);
});
