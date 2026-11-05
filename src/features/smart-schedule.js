import { $, escapeHtml as escape, showToast } from '../utils/dom.js';
import { apiRequest } from './ai/api.js';
import { dateInZone, DEFAULT_TIME_ZONE } from '../domain/scheduling.js';

export function createSmartSchedule({ account, getState, onApply }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'smart-schedule-dialog';
  dialog.setAttribute('aria-labelledby', 'smart-schedule-title');
  dialog.innerHTML = `<div class="smart-schedule-head"><div><small>YOUR TIME, THOUGHTFULLY PLANNED</small><h2 id="smart-schedule-title">Make room for your day</h2></div><button type="button" data-close aria-label="Close planner">×</button></div>
    <p>Choose your tasks and available hours. Hibi fits them around your existing time slots. No AI subscription needed.</p>
    <form><div class="smart-schedule-settings">
    <label>Start date<input name="startDate" type="date" required></label>
    <label>Plan for<select name="days"><option value="1">One day</option><option value="3">Three days</option><option value="7">Seven days</option></select></label>
    <label>Available from<input name="startTime" type="time" value="09:00" required></label>
    <label>Until<input name="endTime" type="time" value="17:00" required></label>
    <label>Timezone<input name="timeZone" value="Africa/Lagos" required></label>
    <label>Break between tasks<select name="breakMinutes"><option value="0">No break</option><option value="5" selected>5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></label></div>
    <p>These hours repeat each day in this plan. Existing future time slots stay fixed. Past unfinished tasks can be selected to move forward.</p>
    <h3>What would you like to work on?</h3><div data-candidates></div>
    <button type="submit" class="primary">Suggest a schedule</button></form>
    <p data-status role="status"></p><section data-preview aria-label="Proposed schedule"></section>
    <button type="button" data-apply class="primary" hidden>Apply plan</button>`;
  document.body.append(dialog);
  const form = $('form', dialog);
  const status = $('[data-status]', dialog);
  const preview = $('[data-preview]', dialog);
  const apply = $('[data-apply]', dialog);
  let draft = null;
  let signature = '';
  let generation = 0;
  function invalidate() { generation++; draft = null; apply.hidden = true; preview.replaceChildren(); }
  function close() { invalidate(); status.textContent = ''; dialog.close(); }
  $('[data-close]', dialog).addEventListener('click', close);
  dialog.addEventListener('close', invalidate);
  form.addEventListener('input', invalidate);
  globalThis.addEventListener('hibi-session-changed', close);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    invalidate();
    const version = generation;
    const owner = account.getUserId();
    const submit = $('button[type=submit]', form);
    submit.disabled = true;
    status.textContent = 'Checking your available time…';
    try {
      const selected = [...form.querySelectorAll('[data-task-row]')].filter((row) => $('input[type=checkbox]', row).checked).map((row) => {
        const duration = $('input[type=number]', row).value;
        return { id: row.dataset.taskRow, priority: $('select', row).value, ...(duration ? { durationMinutes: Number(duration) } : {}) };
      });
      if (!selected.length) throw new Error('Choose at least one task to plan.');
      const revision = await account.preparePlanning();
      signature = JSON.stringify(getState().tasks);
      const values = Object.fromEntries(new FormData(form));
      const result = await apiRequest('/api/schedule/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, days: Number(values.days), breakMinutes: Number(values.breakMinutes), selected, revision }) });
      if (version !== generation || !account.isReady() || owner !== account.getUserId()) return;
      draft = result;
      const tasks = new Map(getState().tasks.map((task) => [String(task.id), task]));
      status.textContent = `${result.proposals.length} tasks planned · ${result.plannedMinutes} minutes. Review before applying.`;
      preview.innerHTML = `${result.warnings.map((warning) => `<p>${escape(warning)}</p>`).join('')}
        ${result.proposals.length ? `<h3>Your proposed schedule</h3>${result.proposals.map((item) => `<article><strong>${escape(tasks.get(item.id)?.title)}</strong><p>${escape(item.scheduledDate)} · ${escape(item.startTime)} · ${item.durationMinutes} min · ${escape(item.timeZone)}</p><small>${escape(item.reason)}</small></article>`).join('')}` : ''}
        ${result.unplanned.length ? `<h3>Kept out of this plan</h3>${result.unplanned.map((item) => `<article><strong>${escape(tasks.get(item.id)?.title)}</strong><p>${escape(item.reason)}</p></article>`).join('')}` : ''}`;
      apply.hidden = !result.proposals.length;
    } catch (error) { if (version === generation) status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  apply.addEventListener('click', () => {
    if (!draft || !account.isReady()) return;
    if (JSON.stringify(getState().tasks) !== signature) {
      invalidate(); status.textContent = 'Your tasks changed. Suggest a fresh schedule before applying.'; return;
    }
    const patches = new Map(draft.proposals.map(({ reason, ...patch }) => [patch.id, patch]));
    const tasks = getState().tasks.map((task) => {
      const patch = patches.get(String(task.id));
      // Deadlines retain their original timezone; do not change that meaning silently.
      return patch ? { ...task, ...patch, id: task.id, when: 'Anytime' } : task;
    });
    if (onApply(tasks) !== false) { close(); showToast('Plan applied. Check account status for sync.'); }
  });
  return {
    isOpen: () => dialog.open,
    open() {
      if (!account.isReady()) return;
      invalidate(); status.textContent = '';
      form.elements.timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
      form.elements.startDate.value = dateInZone(new Date(), form.elements.timeZone.value);
      const tasks = getState().tasks.filter((task) => !task.done).slice(0, 200);
      $('[data-candidates]', form).innerHTML = tasks.length ? tasks.map((task) => `<div data-task-row="${escape(task.id)}" class="smart-schedule-task">
        <label><input type="checkbox" ${task.when === 'Someday' || task.startTime ? '' : 'checked'}><span>${escape(task.title)}<small>${escape(task.project)}${task.dueDate ? ` · due ${escape(task.dueDate)}` : ''}</small></span></label>
        <label>Minutes<input type="number" min="1" max="1440" step="1" placeholder="Estimate" value="${escape(task.durationMinutes || task.estimatedMinutes || '')}"></label>
        <label>Priority<select>${['high', 'medium', 'low'].map((value) => `<option value="${value}" ${value === (task.priority || 'medium') ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>`).join('') : '<p>Add a task first, then come back to plan your time.</p>';
      dialog.showModal();
    },
  };
}
