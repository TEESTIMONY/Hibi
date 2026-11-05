import { $, escapeHtml as escape, showToast } from '../utils/dom.js';
import { apiRequest } from './ai/api.js';
import { getProjectTag } from '../domain/tasks.js';

export function createMessageTasks({ account, getState, onImport }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'smart-schedule-dialog message-tasks-dialog';
  dialog.setAttribute('aria-labelledby', 'message-tasks-title');
  dialog.innerHTML = `<div class="smart-schedule-head"><div><small>FROM WORDS TO NEXT STEPS</small><h2 id="message-tasks-title">Find tasks in your notes</h2></div><button type="button" data-close aria-label="Close message parser">×</button></div>
    <p>Paste a message or a few notes. Hibi recognises clear English actions and dates using its own rules. No OpenAI call.</p>
    <form data-source><label>Message or notes<textarea name="text" required maxlength="20000" rows="6" placeholder="Submit the report by Friday.&#10;Call Ada tomorrow at 3pm for 30 minutes."></textarea></label>
    <div class="smart-schedule-settings"><label>Timezone<input name="timeZone" required></label><label>Add to space<select name="project"></select></label></div>
    <button type="submit" class="primary">Find suggested tasks</button></form>
    <p data-status role="status"></p><form data-review hidden><div data-results></div><button type="submit" class="primary">Add selected tasks</button></form>`;
  document.body.append(dialog);
  const source = $('[data-source]', dialog);
  const review = $('[data-review]', dialog);
  review.noValidate = true;
  const status = $('[data-status]', dialog);
  let suggestions = [];
  let generation = 0;
  function clear() { generation++; suggestions = []; review.hidden = true; $('[data-results]', dialog).replaceChildren(); }
  function close() { clear(); source.reset(); status.textContent = ''; dialog.close(); }
  $('[data-close]', dialog).addEventListener('click', close);
  dialog.addEventListener('close', () => { clear(); source.reset(); });
  source.addEventListener('input', clear);
  globalThis.addEventListener('hibi-session-changed', close);
  source.addEventListener('submit', async (event) => {
    event.preventDefault(); clear();
    const version = generation;
    const owner = account.getUserId();
    const submit = $('button[type=submit]', source);
    submit.disabled = true; status.textContent = 'Looking for clear actions…';
    try {
      const result = await apiRequest('/api/tasks/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source.elements.text.value, timeZone: source.elements.timeZone.value.trim() }) });
      if (version !== generation || owner !== account.getUserId() || !account.isReady()) return;
      suggestions = result.suggestions;
      status.textContent = `${suggestions.length} suggestions. ${result.message}${result.skippedLines ? ` ${result.skippedLines} lines weren't recognised.` : ''}`;
      $('[data-results]', review).innerHTML = suggestions.map((item, index) => `<article data-suggestion="${index}">
        <label class="message-pick"><input type="checkbox" data-selected> Add this task</label>
        <label>Task title<input data-title maxlength="500" required value="${escape(item.title)}"></label>
        <div class="smart-schedule-settings"><label>Planned date<input data-date type="date" value="${escape(item.scheduledDate || '')}"></label>
        <label>Deadline<input data-deadline type="date" value="${escape(item.dueDate || '')}"></label>
        <label>Minutes<input data-duration type="number" min="1" max="1440" step="1" placeholder="Add estimate" value="${item.durationMinutes || ''}"></label>
        <label>Priority<select data-priority>${['high', 'medium', 'low'].map((value) => `<option value="${value}" ${value === item.priority ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
        <details><summary>Source text</summary><p>${escape(item.source)}</p></details>
        ${item.warnings.length ? `<ul>${item.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}</article>`).join('');
      review.hidden = !suggestions.length;
    } catch (error) { if (version === generation) status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  review.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!account.isReady()) return;
    const project = source.elements.project.value;
    if (!getState().projects.includes(project)) { status.textContent = 'That space changed. Reopen this screen and choose a space.'; return; }
    const rows = [...review.querySelectorAll('[data-suggestion]')].filter((row) => $('[data-selected]', row).checked);
    if (!rows.length) { status.textContent = 'Review the suggestions and select the tasks you want to add.'; return; }
    for (const row of rows) {
      for (const field of row.querySelectorAll('input, select')) {
        if (!field.reportValidity()) return;
      }
    }
    const tasks = rows.map((row) => {
      const item = suggestions[Number(row.dataset.suggestion)];
      const duration = $('[data-duration]', row).value;
      return { id: crypto.randomUUID(), title: $('[data-title]', row).value.trim(), project, tag: getProjectTag(project),
        when: 'Inbox', done: false, checks: [], notes: `Source message:\n${item.source}${item.mentionedTime ? `\nTime mentioned: ${item.mentionedTime}. Confirm a fixed time in the task editor.` : ''}`,
        scheduledDate: $('[data-date]', row).value || null, dueDate: $('[data-deadline]', row).value || null,
        durationMinutes: duration ? Number(duration) : null, startTime: null, reminderMinutes: null,
        timeZone: source.elements.timeZone.value.trim(), priority: $('[data-priority]', row).value };
    });
    if (tasks.some((task) => !task.title)) { status.textContent = 'Give each selected task a title.'; return; }
    const duplicates = tasks.filter((task) => getState().tasks.some((existing) => !existing.done && existing.project === task.project && existing.title.trim().toLowerCase() === task.title.toLowerCase()));
    if (duplicates.length) { status.textContent = 'A selected task already exists in this space. Unselect it or edit its title.'; return; }
    if (onImport(tasks) !== false) { close(); showToast(`${tasks.length} tasks added. Use Plan my time to schedule them.`); }
  });
  return { isOpen: () => dialog.open, open() {
    if (!account.isReady()) return;
    clear(); status.textContent = '';
    source.elements.timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos';
    source.elements.project.innerHTML = getState().projects.map((project) => `<option>${escape(project)}</option>`).join('');
    dialog.showModal(); source.elements.text.focus();
  } };
}
