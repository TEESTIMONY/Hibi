import { effectiveWhen } from '../domain/scheduling.js';
import { escapeHtml as escape } from '../utils/dom.js';

export function renderSchedule(tasks) {
  const timed = tasks.filter((task) => !task.done && task.startTime && ['Today', 'This Evening'].includes(effectiveWhen(task)))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  document.querySelector('.schedule').innerHTML = `<div class="schedule-heading"><h3>Today’s schedule</h3></div>
    <p class="calendar-hint">Your planned time slots · times shown in each task’s timezone</p>
    ${timed.length ? timed.map((task) => {
      const [hour, minute] = task.startTime.split(':').map(Number);
      const end = hour * 60 + minute + task.durationMinutes;
      const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      return `<div class="event"><time>${escape(task.startTime.slice(0, 5))}<small>${endTime}${end >= 1440 ? ' +1 day' : ''}</small></time>
        <div><strong>${escape(task.title)}</strong><small>${escape(task.timeZone || 'Africa/Lagos')} · ${task.durationMinutes} min</small></div></div>`;
    }).join('') : '<p class="calendar-hint">No time slots yet. Add a start time and duration to a task.</p>'}`;
}
