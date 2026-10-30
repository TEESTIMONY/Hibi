import { $, escapeHtml as escape } from '../utils/dom.js';
import { selectTasks } from '../domain/tasks.js';
import { icon } from './icons.js';

function renderChecklist(task) {
  return `<div class="mini-checks">${task.checks.map((item, index) => `
    <label>
      <input type="checkbox" data-step="${escape(task.id)}:${index}" ${item.done ? 'checked' : ''}>
      ${escape(item.text)}
    </label>`).join('')}</div>`;
}

function renderTask(task) {
  const expanded = !task.done && task.checks?.length > 0;
  const checklistCount = task.checks?.length
    ? `<span>☷ ${task.checks.filter((item) => item.done).length}/${task.checks.length}</span>` : '';

  return `
    <article class="task ${task.done ? 'done' : ''} ${expanded ? 'featured' : ''}">
      <input class="check" type="checkbox" aria-label="Complete ${escape(task.title)}"
        data-check="${escape(task.id)}" ${task.done ? 'checked' : ''}>
      <div class="task-content">
        <div data-edit="${escape(task.id)}" tabindex="0" role="button">
          <div class="task-name">${escape(task.title)}</div>
          ${expanded && task.notes ? `<p class="note-preview">${escape(task.notes)}</p>` : ''}
          <div class="task-meta">
            <span class="tag ${escape(task.tag)}">${escape(task.tag)}</span>
            ${task.project !== task.tag ? `<span>◉ ${escape(task.project)}</span>` : ''}
            ${task.notes ? '<span>≡</span>' : ''}${checklistCount}
          </div>
        </div>
        ${expanded ? renderChecklist(task) : ''}
      </div>
    </article>`;
}

export function renderTaskList(state) {
  const tasks = selectTasks(state.tasks, state);
  const groups = state.view === 'Today'
    ? [{ title: 'Your focus', when: 'Today' }, { title: 'This evening', when: 'This Evening' }]
    : [{ title: state.view }];

  $('#tasks').innerHTML = groups.map((group) => {
    const rows = tasks.filter((task) => !group.when || task.when === group.when);
    return `
      <div class="group-heading">
        <span>${icon(group.when === 'This Evening' ? 'moon' : 'Today')}</span>
        ${escape(group.title)}<small>${rows.filter((task) => !task.done).length} tasks</small>
      </div>
      ${rows.length ? rows.map(renderTask).join('') : `
        <div class="empty">A little space to breathe.<br>Add a to-do when you’re ready.</div>`}`;
  }).join('');

  $('#total').textContent = selectTasks(state.tasks, { ...state, filter: 'all', search: '' }).length;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}
