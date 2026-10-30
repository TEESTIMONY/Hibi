export function belongsToView(task, view) {
  if (view === 'Logbook') return Boolean(task.done);
  if (view === 'Today') return ['Today', 'This Evening'].includes(task.when);
  if (view === 'Upcoming') return task.when === 'Tomorrow';
  if (['Inbox', 'Anytime', 'Someday'].includes(view)) return task.when === view;
  return task.project === view;
}

export function selectTasks(tasks, { view, filter = 'all', search = '', showCompleted = true }) {
  const query = search.trim().toLowerCase();
  return tasks.filter((task) => {
    const matchesCompletion = view === 'Logbook' || showCompleted || !task.done;
    const matchesTag = filter === 'all' || task.tag === filter;
    const matchesSearch = `${task.title} ${task.notes ?? ''} ${task.project}`.toLowerCase().includes(query);
    return belongsToView(task, view) && matchesCompletion && matchesTag && matchesSearch;
  });
}

export function getTodayProgress(tasks) {
  const today = tasks.filter((task) => belongsToView(task, 'Today'));
  const completed = today.filter((task) => task.done).length;
  return {
    total: today.length,
    completed,
    percent: today.length ? Math.round((completed / today.length) * 100) : 0,
  };
}

export function getProjectTag(project) {
  if (['Work', 'Website refresh'].includes(project)) return 'Work';
  return project === 'Health' ? 'Health' : 'Personal';
}

export function buildChecklist(text, previous = []) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((text) => ({
    text,
    done: previous.find((item) => item.text === text)?.done ?? false,
  }));
}

export function upsertTask(tasks, task) {
  return tasks.some((existing) => existing.id === task.id)
    ? tasks.map((existing) => existing.id === task.id ? task : existing)
    : [...tasks, task];
}
