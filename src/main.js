import { DEFAULT_PLANNER } from './data/defaults.js';
import { createStore } from './state/store.js';
import { loadPlanner, savePlanner, loadTheme, saveTheme } from './services/storage.js';
import { upsertTask } from './domain/tasks.js';
import { renderNavigation } from './components/navigation.js';
import { renderTaskList } from './components/task-list.js';
import { renderDashboard } from './components/dashboard.js';
import { createTaskEditor } from './components/task-editor.js';
import { icon } from './components/icons.js';
import { $, showToast } from './utils/dom.js';
import { createAIIntake } from './features/ai/intake.js';
import { revealPlanner } from './features/launch.js';

const store = createStore({
  ...loadPlanner(localStorage, DEFAULT_PLANNER),
  view: 'Today',
  filter: 'all',
  search: '',
  showCompleted: true,
});

function render(state) {
  renderNavigation(state);
  renderTaskList(state);
  renderDashboard(state);
}

function saveChanges(patch) {
  const next = { ...store.getState(), ...patch };
  try {
    savePlanner(localStorage, next);
    store.update(patch);
    return true;
  } catch {
    showToast('Your browser could not save this change. Check available storage.');
    return false;
  }
}

const editor = createTaskEditor({
  getState: store.getState,
  onSave(task) {
    const saved = saveChanges({ tasks: upsertTask(store.getState().tasks, task) });
    if (saved) showToast('To-do saved');
    return saved;
  },
  onDelete(id) {
    const saved = saveChanges({ tasks: store.getState().tasks.filter((task) => task.id !== id) });
    if (saved) showToast('To-do deleted');
    return saved;
  },
});

function navigate(view) {
  $('#search').value = '';
  store.update({ view, filter: 'all', search: '' });
}

function createProject() {
  const name = prompt('Give your new project a name')?.trim();
  if (!name) return;
  const { projects } = store.getState();
  if (projects.includes(name)) return navigate(name);
  if (saveChanges({ projects: [...projects, name] })) navigate(name);
}

const aiIntake = createAIIntake({
  getState: store.getState,
  onImport(tasks, project) {
    const saved = saveChanges({ tasks: [...store.getState().tasks, ...tasks] });
    if (saved) navigate(project);
    return saved;
  },
});

const actions = {
  'open-ai': () => aiIntake.open(),
  'new-task': () => editor.open(),
  'new-project': createProject,
  'close-editor': () => editor.close(),
  'toggle-completed': () => {
    const showCompleted = !store.getState().showCompleted;
    store.update({ showCompleted });
    showToast(showCompleted ? 'Completed tasks are visible' : 'Completed tasks are hidden');
  },
};

// Delegate dynamic list events once, rather than rebinding after every render.
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]');
  if (action) return actions[action.dataset.action]?.();
  const destination = event.target.closest('[data-view]');
  if (destination) return navigate(destination.dataset.view);
  const filter = event.target.closest('[data-filter]');
  if (filter) return store.update({ filter: filter.dataset.filter });
  const task = event.target.closest('[data-edit]');
  if (task) editor.open(task.dataset.edit);
});

$('#tasks').addEventListener('change', (event) => {
  const { check, step } = event.target.dataset;
  const { tasks } = store.getState();
  if (check !== undefined) {
    const done = event.target.checked;
    if (saveChanges({ tasks: tasks.map((task) => String(task.id) === check ? { ...task, done } : task) })) {
      showToast(done ? 'A little progress. Nicely done!' : 'To-do restored');
    }
  }
  if (step !== undefined) {
    const [id, index] = step.split(':');
    saveChanges({
      tasks: tasks.map((task) => String(task.id) !== id ? task : {
        ...task,
        checks: task.checks.map((item, itemIndex) => (
          itemIndex === Number(index) ? { ...item, done: event.target.checked } : item
        )),
      }),
    });
  }
});

document.addEventListener('keydown', (event) => {
  const task = event.target.closest('[data-edit]');
  if (task && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    editor.open(task.dataset.edit);
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || editor.isOpen() || aiIntake.isOpen()) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    editor.open();
  }
  if (event.key === '/') {
    event.preventDefault();
    $('#search').focus();
  }
});

$('#search').addEventListener('input', (event) => store.update({ search: event.target.value }));
$('.brand').setAttribute('aria-label', 'Hibi home');
$('.brand').addEventListener('click', (event) => { event.preventDefault(); navigate('Today'); });
$('.search').firstChild.replaceWith(document.createRange().createContextualFragment(icon('search')));
$('#theme').innerHTML = icon('Today');
document.body.classList.toggle('dark', loadTheme(localStorage) === 'dark');
$('#theme').addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  try { saveTheme(localStorage, dark ? 'dark' : 'light'); }
  catch { showToast('Theme changed for this session only.'); }
});

store.subscribe(render);
render(store.getState());
revealPlanner();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // The planner works without installation; sharing requires a supported host.
  });
}
