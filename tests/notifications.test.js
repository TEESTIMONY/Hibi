import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { schedulingFields } from '../src/domain/scheduling.js';
import { decodePushKey } from '../src/features/notifications.js';

test('web-push keys decode from URL-safe base64', () => {
  assert.deepEqual([...decodePushKey('-_8')], [251, 255]);
});

test('reminders require a complete timed slot and support at-start reminders', () => {
  const fields = { date: '2030-01-02', startTime: '09:00', duration: '30', timeZone: 'Africa/Lagos', when: 'Anytime', dueDate: '' };
  assert.equal(schedulingFields({ ...fields, reminderMinutes: '0' }).reminderMinutes, 0);
  assert.equal(schedulingFields({ ...fields, reminderMinutes: '10' }).reminderMinutes, 10);
  assert.equal(schedulingFields(fields).reminderMinutes, null);
  assert.throws(() => schedulingFields({ ...fields, startTime: '', reminderMinutes: '10' }), /reminder/);
});

test('notification clicks can only navigate to this frontend and preserve a task identifier', async () => {
  const handlers = {};
  let shown; let opened;
  const context = vm.createContext({ URL, Response, console,
    self: { location: { origin: 'https://hibi.example' }, addEventListener: (type, handler) => { handlers[type] = handler; },
      registration: { showNotification: async (title, options) => { shown = { title, ...options }; } },
      clients: { matchAll: async () => [], openWindow: async (url) => { opened = url; } } },
  });
  vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Hibi', taskId: 'https://evil.example/?x=1', url: 'https://evil.example' }) }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  handlers.notificationclick({ notification: { data: shown.data, close() {} }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  const url = new URL(opened);
  assert.equal(url.origin, 'https://hibi.example');
  assert.equal(url.searchParams.get('task'), 'https://evil.example/?x=1');
});
