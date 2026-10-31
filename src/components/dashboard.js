import { $ } from '../utils/dom.js';
import { formatDate, getWeek } from '../utils/dates.js';
import { getTodayProgress } from '../domain/tasks.js';
import { icon } from './icons.js';

const SUBTITLES = {
  Today: 'Make room for what matters.',
  Logbook: 'Look how far you’ve come.',
  Inbox: 'A home for everything on your mind.',
  Upcoming: 'A little intention for the days ahead.',
};

export function renderDashboard({ view, tasks, showCompleted }) {
  $('#title').textContent = view;
  $('#view-icon').innerHTML = icon(view);
  $('#breadcrumb').textContent = `My workspace / ${view}`;
  $('#subtitle').textContent = SUBTITLES[view] ?? 'Small steps toward something meaningful.';
  $('#date').textContent = formatDate({ weekday: 'long', month: 'long', day: 'numeric' });

  const completedLabel = showCompleted ? 'Hide completed tasks' : 'Show completed tasks';
  $('.more').innerHTML = icon('more');
  $('.more').setAttribute('aria-label', completedLabel);
  $('.more').title = completedLabel;

  const week = $('#week-strip');
  week.hidden = view !== 'Today';
  week.innerHTML = getWeek().map((day) => `
    <div class="week-day ${day.current ? 'current' : day.past ? 'past' : ''}"
      ${day.current ? 'aria-current="date"' : ''}>
      <span>${day.label}</span><b>${day.day}</b><i></i>
    </div>`).join('');

  const { completed, total, percent } = getTodayProgress(tasks);
  $('#progress-text').textContent = `${completed} of ${total} completed`;
  $('#progress-percent').textContent = `${percent}%`;
  $('#progress').style.width = `${percent}%`;
}
