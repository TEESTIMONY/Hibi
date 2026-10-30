import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTasks, belongsToView, getTodayProgress, buildChecklist, upsertTask } from '../src/domain/tasks.js';
import { DEFAULT_PLANNER } from '../src/data/defaults.js';

test('Today includes evening and Upcoming includes tomorrow', () => {
  assert.equal(belongsToView({ when: 'This Evening' }, 'Today'), true);
  assert.equal(belongsToView({ when: 'Tomorrow' }, 'Upcoming'), true);
  assert.equal(belongsToView({ when: 'Someday' }, 'Upcoming'), false);
});

test('view, tag, search, and completion filters work together', () => {
  const result = selectTasks(DEFAULT_PLANNER.tasks, {
    view: 'Today', filter: 'Work', search: 'proposal', showCompleted: false,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 2);
  assert.equal(selectTasks(DEFAULT_PLANNER.tasks, { view: 'Website refresh' }).length, 2);
});

test('Logbook shows completed tasks even when hidden elsewhere', () => {
  const result = selectTasks(DEFAULT_PLANNER.tasks, { view: 'Logbook', showCompleted: false });
  assert.equal(result.length, 1);
  assert.ok(result.every((task) => task.done));
});

test('progress handles completed tasks and an empty planner', () => {
  assert.deepEqual(getTodayProgress(DEFAULT_PLANNER.tasks), { completed: 1, total: 7, percent: 14 });
  assert.deepEqual(getTodayProgress([]), { completed: 0, total: 0, percent: 0 });
});

test('editing checklists preserves completed steps and removes blank lines', () => {
  assert.deepEqual(buildChecklist('  Existing step\n\nNew step ', [
    { text: 'Existing step', done: true },
  ]), [{ text: 'Existing step', done: true }, { text: 'New step', done: false }]);
});

test('updates support legacy numeric IDs and new UUIDs without mutation', () => {
  const original = [{ id: 1, title: 'Original' }];
  const changed = upsertTask(original, { id: 1, title: 'Changed' });
  const added = upsertTask(changed, { id: 'uuid-example', title: 'New' });
  assert.equal(original[0].title, 'Original');
  assert.equal(changed[0].title, 'Changed');
  assert.equal(added.length, 2);
});
