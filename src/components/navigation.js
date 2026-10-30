import { belongsToView } from '../domain/tasks.js';
import { $, escapeHtml } from '../utils/dom.js';
import { icon } from './icons.js';

const VIEWS = [
  ['Inbox', '#75b9cd'], ['Today', '#efbc4b'], ['Upcoming', '#d995a8'],
  ['Anytime', '#75b7ae'], ['Someday', '#c1b679'], ['Logbook', '#88b69b'],
];
const PROJECT_COLORS = ['#91a9cf', '#a7b7d1', '#c5ae96', '#c5ae96', '#9bbba7'];

export function renderNavigation({ view, tasks, projects }) {
  $('#nav').innerHTML = VIEWS.map(([name, color]) => {
    const count = tasks.filter((task) => !task.done && belongsToView(task, name)).length;
    const active = view === name;
    return `
      ${name === 'Logbook' ? '<div class="divider"></div>' : ''}
      <button class="${active ? 'active' : ''}" data-view="${name}"
        aria-label="${name}" aria-current="${active ? 'page' : 'false'}">
        <span class="icon" style="color:${color}">${icon(name)}</span>
        <span class="label">${name}</span>
        <span class="count">${count || ''}</span>
      </button>`;
  }).join('');

  $('#projects').innerHTML = projects.map((project, index) => {
    const count = tasks.filter((task) => task.project === project && !task.done).length;
    return `
      <button class="project ${view === project ? 'active' : ''}"
        data-view="${escapeHtml(project)}">
        <i style="border-color:${PROJECT_COLORS[index % PROJECT_COLORS.length]}"></i>
        ${escapeHtml(project)}<small>${count || ''}</small>
      </button>`;
  }).join('');
}
