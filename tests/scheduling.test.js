import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsToView } from '../src/domain/tasks.js';
import { dateInZone, effectiveWhen, schedulingFields, shiftDate } from '../src/domain/scheduling.js';

const now = new Date('2026-10-31T23:30:00Z');
test('scheduling uses each task timezone across midnight and month boundaries', () => {
  assert.equal(dateInZone(now, 'Africa/Lagos'), '2026-11-01');
  assert.equal(dateInZone(now, 'America/New_York'), '2026-10-31');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});
test('scheduled dates override relative labels and unfinished past work stays visible', () => {
  const future = { when: 'Today', scheduledDate: '2026-11-03', timeZone: 'Africa/Lagos' };
  assert.equal(belongsToView(future, 'Today', now), false);
  assert.equal(belongsToView(future, 'Upcoming', now), true);
  const past = { ...future, scheduledDate: '2026-10-30' };
  assert.equal(effectiveWhen(past, now), 'Overdue');
  assert.equal(belongsToView(past, 'Today', now), true);
  assert.equal(belongsToView({ ...past, done: true }, 'Today', now), false);
  assert.equal(belongsToView({ ...past, done: true }, 'Logbook', now), true);
});
test('Today and Tomorrow selections are anchored to concrete dates when saved', () => {
  const fields = { date: '', startTime: '', duration: '', timeZone: 'Africa/Lagos', dueDate: '' };
  assert.equal(schedulingFields({ ...fields, when: 'Tomorrow' }, now).scheduledDate, '2026-11-02');
  assert.equal(schedulingFields({ ...fields, when: 'Today' }, now).scheduledDate, '2026-11-01');
  assert.equal(schedulingFields({ ...fields, when: 'Someday' }, now).scheduledDate, null);
});
test('timed tasks require a date and valid duration; timezone names are checked', () => {
  const fields = { date: '', startTime: '09:30', duration: '', timeZone: 'Africa/Lagos', when: 'Anytime', dueDate: '' };
  assert.throws(() => schedulingFields(fields), /date and duration/);
  assert.throws(() => schedulingFields({ ...fields, duration: '0' }), /Duration/);
  assert.throws(() => schedulingFields({ ...fields, timeZone: 'Invalid/Zone' }), RangeError);
  const saved = schedulingFields({ ...fields, date: '2026-11-04', duration: '45', dueDate: '2026-11-05' });
  assert.equal(saved.durationMinutes, 45);
  assert.equal(saved.startTime, '09:30');
  assert.equal(saved.dueDate, '2026-11-05');
});
