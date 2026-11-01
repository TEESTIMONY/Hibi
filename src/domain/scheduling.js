export const DEFAULT_TIME_ZONE = 'Africa/Lagos';

export function dateInZone(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function effectiveWhen(task, now = new Date()) {
  if (!task.scheduledDate) return task.when;
  const today = dateInZone(now, task.timeZone || DEFAULT_TIME_ZONE);
  if (task.scheduledDate < today) return task.done ? 'Past' : 'Overdue';
  if (task.scheduledDate === today) return task.when === 'This Evening' ? 'This Evening' : 'Today';
  return 'Upcoming';
}

export function schedulingFields({ date, startTime, duration, timeZone, dueDate, when, reminderMinutes = '' }, now = new Date()) {
  // Intl validates IANA zones in both device-only and account modes.
  dateInZone(now, timeZone);
  const scheduledDate = date || (['Today', 'This Evening', 'Tomorrow'].includes(when)
    ? shiftDate(dateInZone(now, timeZone), when === 'Tomorrow' ? 1 : 0) : null);
  const durationMinutes = duration === '' ? null : Number(duration);
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
    throw new Error('Duration must be between 1 and 1,440 minutes.');
  }
  if (startTime && (!scheduledDate || !durationMinutes)) throw new Error('Choose a date and duration for a timed task.');
  const reminder = reminderMinutes === '' ? null : Number(reminderMinutes);
  if (reminder !== null && (![0, 5, 10, 15, 30, 60, 1440].includes(reminder) || !startTime || !scheduledDate || !durationMinutes)) {
    throw new Error('A reminder needs a date, start time, duration, and a supported reminder interval.');
  }
  return { scheduledDate, startTime: startTime || null, durationMinutes, timeZone, dueDate: dueDate || null, reminderMinutes: reminder };
}

export function scheduleLabel(task) {
  if (!task.scheduledDate) return '';
  return [task.scheduledDate, task.startTime?.slice(0, 5), task.durationMinutes ? `${task.durationMinutes} min` : '', task.timeZone || DEFAULT_TIME_ZONE].filter(Boolean).join(' · ');
}
