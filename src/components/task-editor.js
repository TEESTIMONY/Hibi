import { $, escapeHtml } from '../utils/dom.js';
import { buildChecklist, getProjectTag } from '../domain/tasks.js';
import { schedulingFields, DEFAULT_TIME_ZONE } from '../domain/scheduling.js';

export function createTaskEditor({ getState, onSave, onDelete }) {
  const dialog = $('#editor');
  const form = $('#task-form');
  let editingId = null;

  function close() { dialog.close(); }
  $('#task-when').addEventListener('change', () => { $('#task-date').value = ''; });

  function open(id = null) {
    const { tasks, projects, view } = getState();
    const task = tasks.find((item) => String(item.id) === String(id));
    editingId = task?.id ?? null;
    $('#modal-title').textContent = task ? 'Edit to-do' : 'New to-do';
    $('#task-title').value = task?.title ?? '';
    $('#task-notes').value = task?.notes ?? '';
    $('#task-date').value = task?.scheduledDate ?? '';
    $('#task-start').value = task?.startTime?.slice(0, 5) ?? '';
    $('#task-duration').value = task?.durationMinutes ?? task?.estimatedMinutes ?? '';
    $('#task-deadline').value = task?.dueDate ?? '';
    $('#task-reminder').value = task?.reminderMinutes ?? '';
    $('#task-zone').value = task?.timeZone ?? DEFAULT_TIME_ZONE;
    $('#task-schedule-error').textContent = '';
    $('#task-checklist').value = (task?.checks ?? []).map((item) => item.text).join('\n');
    $('#task-when').value = task?.when ?? (
      ['Inbox', 'Anytime', 'Someday'].includes(view) ? view : view === 'Upcoming' ? 'Tomorrow' : 'Today'
    );
    $('#task-project').innerHTML = projects.map((project) => `<option>${escapeHtml(project)}</option>`).join('');
    $('#task-project').value = task?.project ?? (projects.includes(view) ? view : 'Personal');
    $('#delete-task').style.visibility = task ? 'visible' : 'hidden';
    dialog.showModal();
    $('#task-title').focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#task-title').value.trim();
    if (!title) return;
    const previous = getState().tasks.find((task) => task.id === editingId);
    const project = $('#task-project').value;
    let schedule;
    try {
      schedule = schedulingFields({ date: $('#task-date').value, startTime: $('#task-start').value,
        duration: $('#task-duration').value, timeZone: $('#task-zone').value.trim(),
        dueDate: $('#task-deadline').value, when: $('#task-when').value, reminderMinutes: $('#task-reminder').value });
    } catch (error) {
      $('#task-schedule-error').textContent = error instanceof RangeError ? 'Use a valid timezone, such as Africa/Lagos.' : error.message;
      return;
    }
    const saved = onSave({
      ...previous,
      ...schedule,
      id: editingId ?? crypto.randomUUID(),
      title,
      project,
      notes: $('#task-notes').value,
      when: $('#task-when').value,
      tag: getProjectTag(project),
      checks: buildChecklist($('#task-checklist').value, previous?.checks),
    });
    if (saved !== false) close();
  });

  $('#delete-task').addEventListener('click', () => {
    if (onDelete(editingId) !== false) close();
  });

  return { open, close, isOpen: () => dialog.open };
}
