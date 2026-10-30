import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('opening screen reveals the planner after its minimum duration', async () => {
  const source = (await readFile(new URL('../src/features/launch.js', import.meta.url), 'utf8')).replace('export function', 'function');
  const timers = [];
  const changes = [];
  const screen = { hidden: false, classList: { add: (value) => changes.push(value) } };
  const context = vm.createContext({
    URLSearchParams,
    document: { querySelector: () => screen, body: { classList: { remove: (value) => changes.push(value) } } },
    matchMedia: () => ({ matches: false }), performance: { now: () => 250 },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  });
  vm.runInContext(`${source}\nrevealPlanner();`, context);
  assert.equal(timers[0].delay, 1050);
  timers[0].callback();
  assert.deepEqual(changes, ['is-launching', 'leaving']);
  assert.equal(timers[1].delay, 350);
  timers[1].callback();
  assert.equal(screen.hidden, true);
});

test('opening preview stays visible without starting a transition', async () => {
  const source = (await readFile(new URL('../src/features/launch.js', import.meta.url), 'utf8')).replace('export function', 'function');
  let timers = 0;
  const screen = { hidden: false };
  const context = vm.createContext({
    URLSearchParams, location: { search: '?preview=opening' },
    document: { querySelector: () => screen },
    setTimeout: () => { timers++; },
  });
  vm.runInContext(`${source}\nrevealPlanner();`, context);
  assert.equal(timers, 0);
  assert.equal(screen.hidden, false);
});
