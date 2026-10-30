import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlanner, savePlanner, loadTheme, DATA_KEY } from '../src/services/storage.js';
import { createStore } from '../src/state/store.js';
import { DEFAULT_PLANNER } from '../src/data/defaults.js';
import { getWeek, formatDate } from '../src/utils/dates.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('existing browser data retains its original storage key and shape', () => {
  const saved = { tasks: [{ id: 42, title: 'Keep my task' }], projects: ['My project'] };
  const storage = memoryStorage({ [DATA_KEY]: JSON.stringify(saved) });
  assert.deepEqual(loadPlanner(storage, DEFAULT_PLANNER), saved);
  savePlanner(storage, { ...saved, view: 'Today', search: 'temporary' });
  assert.deepEqual(JSON.parse(storage.getItem(DATA_KEY)), saved);
});

test('corrupt or unavailable storage falls back without mutating defaults', () => {
  for (const storage of [memoryStorage({ [DATA_KEY]: '{broken' }), {
    getItem() { throw new Error('Unavailable'); },
  }]) {
    const fallback = loadPlanner(storage, DEFAULT_PLANNER);
    fallback.tasks[0].title = 'Edited';
    assert.notEqual(DEFAULT_PLANNER.tasks[0].title, 'Edited');
    assert.equal(loadTheme(storage), 'light');
  }
});

test('store subscriptions notify after updates and can be removed', () => {
  const store = createStore({ count: 0 });
  const seen = [];
  const unsubscribe = store.subscribe((state) => seen.push(state.count));
  store.update((state) => ({ count: state.count + 1 }));
  unsubscribe();
  store.update({ count: 2 });
  assert.deepEqual(seen, [1]);
});

test('Lagos dates work across UTC midnight and month boundaries', () => {
  const now = new Date('2026-10-31T23:30:00Z');
  assert.equal(formatDate({ day: 'numeric', month: 'long' }, now), 'November 1');
  const week = getWeek(now);
  assert.equal(week[0].label, 'Mon');
  assert.deepEqual(week.filter((day) => day.current).map((day) => day.day), [1]);
  assert.equal(week.length, 7);
});
