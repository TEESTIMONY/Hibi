import { $, escapeHtml as escape, showToast } from '../../utils/dom.js';
import { getAIStatus, requestPlan, fileToSource, consumeShare, signIn, signOut } from './api.js';
import { createTasksFromPlan } from './plan-import.js';
import { createVoiceCapture } from './voice.js';
import { addPasswordVisibility } from '../../components/password-visibility.js';

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json,.mp3,.m4a,.mp4,.wav,.webm,.mpeg';
const WHEN = ['Today', 'This Evening', 'Tomorrow', 'Anytime', 'Someday', 'Inbox'];
const EXAMPLE = `Messages from our launch discussion:\n\nOlivia: Please send the revised homepage copy tomorrow. We need to check the mobile layout before publishing.\n\nMy notes: Gather the missing product photos, write a first copy draft, ask Olivia for feedback, then test the page on a phone. Budget about 45 minutes for the first draft.\n\nQuestion: Do we have final approval for the launch date?`;

export function createAIIntake({ getState, onImport, canUse = () => true }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ai-dialog';
  dialog.setAttribute('aria-labelledby', 'ai-title');
  dialog.innerHTML = `
    <div class="ai-modal-head">
      <div class="ai-wordmark"><span>✦</span><div><strong id="ai-title">Plan with AI · Premium</strong><small>Bring the messy bits. Leave with a plan.</small></div></div>
      <button type="button" class="ai-close" aria-label="Close AI planner">×</button>
    </div>
    <div class="ai-columns">
      <section class="ai-input-pane" aria-label="Plan sources">
        <div class="ai-step-label">01 <span>GATHER YOUR THOUGHTS</span></div>
        <div class="ai-input-heading"><h2>What’s on your mind?</h2><span class="ai-status">Checking OpenAI…</span></div>
        <p class="ai-intro">Messages, meeting notes, documents, or a thought out loud. We’ll find the next steps together.</p>
        <form id="ai-form">
          <label class="ai-field-label" for="ai-notes">Messages & notes <button type="button" id="ai-example">Try sample notes ↗</button></label>
          <textarea id="ai-notes" maxlength="60000" placeholder="Paste a WhatsApp message, a few scattered notes, or an entire conversation…"></textarea>
          <div class="ai-dropzone" tabindex="0" role="button" aria-label="Upload source documents or recordings">
            <span class="ai-upload-icon">↥</span><strong>Drop your source files here</strong><small>or choose files · up to 8 files, 12 MB total</small>
          </div>
          <input type="file" id="ai-files" accept="${ACCEPT}" multiple hidden>
          <div class="ai-source-tools"><span>PDF, DOCX, text & audio</span><button type="button" id="ai-record">♩ Record a thought</button></div>
          <div id="ai-file-list" class="ai-file-list"></div>
          <label class="ai-field-label" for="ai-goal">A little direction <span>optional</span></label>
          <input id="ai-goal" maxlength="2000" placeholder="e.g. Make a realistic plan for this week">
          <label class="ai-field-label" for="ai-project">Add the plan to</label>
          <select id="ai-project" aria-label="Project for suggested tasks"></select>
          <p class="ai-consent">When you choose Create a plan, these sources are sent to OpenAI for analysis. Review every suggestion before adding tasks.</p>
          <button type="submit" class="ai-generate">✦ <span>Create a plan</span><span>→</span></button>
        </form>
        <p id="ai-error" class="ai-error" role="alert" hidden></p>
        <div class="ai-setup" hidden>
          <strong>AI planning is coming next</strong>
          <p>The planner works independently. AI will be available when the separate Hibi API is connected.</p>
          <button type="button" id="ai-recheck">Check connection again ↻</button>
        </div>
        <form id="ai-login-form" class="ai-login-form" hidden>
          <strong>Sign in to Hibi</strong><p>Your API account gives you access to AI planning.</p>
          <label for="ai-username">Username</label><input id="ai-username" autocomplete="username" required>
          <label for="ai-password">Password</label><input id="ai-password" type="password" autocomplete="current-password" required>
          <button type="submit">Sign in</button>
        </form>
        <button type="button" id="ai-sign-out" hidden>Sign out of Hibi API</button>
        <details class="ai-share-help"><summary>Bring something over from WhatsApp <span>↗</span></summary>
          <p>Install Hibi as an app on a supported Android / Chromium device. In WhatsApp, choose Share and select Hibi. Review the shared text here, then create your plan.</p>
          <p>Your phone needs a reachable HTTPS deployment. This computer’s localhost address cannot be opened on your phone. iPhone sharing needs a native share extension; paste or upload sources here for now.</p>
        </details>
      </section>
      <section class="ai-output-pane" aria-label="Suggested plan" aria-live="polite">
        <div class="ai-step-label">02 <span>MAKE IT YOURS</span></div>
        <div id="ai-preview"></div>
        <div class="ai-review-footer" hidden><span id="ai-selected-count"></span><button type="button" id="ai-import">Add selected tasks →</button></div>
      </section>
    </div>`;
  document.body.append(dialog);
  addPasswordVisibility(dialog);
  const find = (selector) => $(selector, dialog);
  let files = [];
  let plan = null;
  let selected = new Set();
  let status = null;
  let controller;
  let busy = false;
  let recording = false;
  let imported = false;
  let sessionGeneration = 0;

  function error(message = '') {
    find('#ai-error').textContent = message;
    find('#ai-error').hidden = !message;
  }

  function renderEmpty() {
    find('#ai-preview').innerHTML = `<div class="ai-empty-preview"><div class="ai-paper-art"><span>✦</span><i></i><i></i><i></i></div><h2>From a jumble<br>to a way forward.</h2><p>Your suggested plan will appear here.<br>Nothing joins your list until you say so.</p><div class="ai-empty-steps"><span>Find the actions</span><b>·</b><span>Connect the dots</span><b>·</b><span>You decide</span></div></div>`;
    find('.ai-review-footer').hidden = true;
  }

  async function checkStatus() {
    try {
      status = await getAIStatus();
      const needsLogin = status.requiresAuth && !status.authenticated;
      find('.ai-status').textContent = !status.backendConfigured ? '○ UI preview'
        : needsLogin ? '○ Sign in to use AI' : status.configured ? `● ${status.provider} ready` : '○ AI not configured';
      find('.ai-status').classList.toggle('ready', status.configured && !needsLogin);
      find('.ai-setup').hidden = Boolean(status.configured || needsLogin);
      find('.ai-setup > strong').textContent = status.backendConfigured ? 'AI is not configured yet' : 'AI planning is coming next';
      find('.ai-setup > p').textContent = status.backendConfigured
        ? 'The API is connected, but its OpenAI configuration is not ready yet.'
        : 'The planner works independently. AI will be available when the separate Hibi API is connected.';
      find('#ai-login-form').hidden = !needsLogin;
      find('#ai-sign-out').hidden = !status.authenticated;
    } catch (failure) {
      status = null;
      find('.ai-status').textContent = '○ Backend unavailable';
      error(failure.message);
    }
  }

  function addFiles(incoming) {
    if (busy) return;
    error();
    const next = [...files];
    for (const file of incoming) {
      if (!ACCEPT.split(',').includes(`.${file.name.split('.').pop().toLowerCase()}`)) { error(`${file.name}: unsupported file type. WhatsApp OGG/Opus voice files need conversion to MP3/M4A first.`); continue; }
      if (!file.size || file.size > 8 * 1024 * 1024) { error('Each file must be non-empty and under 8 MB.'); continue; }
      if (next.length >= 8 || next.reduce((sum, item) => sum + item.size, file.size) > 12 * 1024 * 1024) { error('Use up to 8 files and 12 MB total.'); break; }
      next.push(file);
    }
    files = next;
    renderFiles();
  }

  function renderFiles() {
    find('#ai-file-list').innerHTML = files.map((file, index) => `
      <div class="ai-file"><span>▤</span><div><strong>${escape(file.name)}</strong><small>${Math.max(1, Math.round(file.size / 1024))} KB · source ${index + 1}</small></div><button type="button" data-remove="${index}" aria-label="Remove ${escape(file.name)}">×</button></div>`).join('');
  }

  function options(values, chosen) {
    return values.map((value) => `<option ${value === chosen ? 'selected' : ''}>${escape(value)}</option>`).join('');
  }

  function updateSelectedCount() {
    find('#ai-selected-count').textContent = `${selected.size} of ${plan.tasks.length} selected`;
    find('#ai-import').disabled = !selected.size || imported;
  }

  function renderPlan() {
    const sourceNames = new Map(plan.sources.map((source) => [source.id, source.name]));
    find('#ai-preview').innerHTML = `
      <div class="ai-plan-heading"><span class="ai-draft-badge">SUGGESTED PLAN</span><h2>${escape(plan.title)}</h2><p>${escape(plan.summary)}</p></div>
      ${plan.assumptions.length ? `<div class="ai-context-note"><strong>A few assumptions</strong><ul>${plan.assumptions.map((item) => `<li>${escape(item)}</li>`).join('')}</ul></div>` : ''}
      ${plan.questions.length ? `<div class="ai-context-note questions"><strong>Worth clarifying</strong><ul>${plan.questions.map((item) => `<li>${escape(item)}</li>`).join('')}</ul></div>` : ''}
      <div class="ai-plan-list">${plan.tasks.map((task, index) => `
        <article class="ai-plan-task" data-task-index="${index}">
          <div class="ai-plan-task-title"><input type="checkbox" data-select="${index}" checked aria-label="Include task ${index + 1}"><input aria-label="Suggested task ${index + 1}" data-field="title" maxlength="300" value="${escape(task.title)}"></div>
          <div class="ai-plan-task-options"><select data-field="when" aria-label="When to do task ${index + 1}">${options(WHEN, task.when)}</select><select data-field="priority" aria-label="Priority for task ${index + 1}">${options(['low', 'medium', 'high'], task.priority)}</select><span>${task.estimatedMinutes ? `~${task.estimatedMinutes} min` : 'No estimate'}</span></div>
          <details><summary>Notes, steps & source</summary><textarea data-field="notes" aria-label="Notes for task ${index + 1}">${escape(task.notes)}</textarea><label>Checklist · one step per line<textarea data-field="checklist" aria-label="Steps for task ${index + 1}">${escape(task.checklist.join('\n'))}</textarea></label><label>Suggested deadline <input type="date" data-field="dueDate" aria-label="Deadline for task ${index + 1}" value="${escape(task.dueDate || '')}"></label><p class="ai-provenance">From ${escape(task.sourceIds.map((id) => sourceNames.get(id)).filter(Boolean).join(', '))}</p></details>
        </article>`).join('')}</div>
      ${!plan.tasks.length ? '<p class="ai-no-tasks">No actionable tasks were found. Add more context using the questions above.</p>' : ''}`;
    find('.ai-review-footer').hidden = false;
    updateSelectedCount();
  }

  const voice = createVoiceCapture({
    onFile: (file) => addFiles([file]),
    onStatus: (active) => {
      recording = active;
      find('#ai-record').textContent = active ? '● Stop recording' : '♩ Record a thought';
      find('#ai-record').classList.toggle('recording', active);
      find('.ai-generate').disabled = active || busy;
    },
    onError: (message) => error(message),
  });

  find('#ai-record').addEventListener('click', () => recording ? voice.stop() : voice.start());
  find('#ai-example').addEventListener('click', () => { find('#ai-notes').value = EXAMPLE; });
  find('#ai-recheck').addEventListener('click', checkStatus);
  find('#ai-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    error();
    const button = find('#ai-login-form button');
    button.disabled = true;
    try {
      await signIn(find('#ai-username').value, find('#ai-password').value);
      find('#ai-password').value = '';
      await checkStatus();
    } catch (failure) { error(failure.message); }
    finally { button.disabled = false; }
  });
  find('#ai-sign-out').addEventListener('click', async () => {
    try { await signOut(); } catch (failure) { error(failure.message); }
    await checkStatus();
  });
  find('.ai-dropzone').addEventListener('click', () => { if (!busy) find('#ai-files').click(); });
  find('.ai-dropzone').addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); find('#ai-files').click(); }
  });
  find('#ai-files').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
  const dropzone = find('.ai-dropzone');
  dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); addFiles(event.dataTransfer.files); });
  find('#ai-file-list').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove && !busy) { files.splice(Number(remove.dataset.remove), 1); renderFiles(); }
  });
  find('#ai-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canUse() || busy || recording) return;
    const generation = sessionGeneration;
    error();
    if (!status?.backendConfigured) { find('.ai-setup').hidden = false; error('AI is not connected yet. No content has been sent.'); return; }
    if (status.requiresAuth && !status.authenticated) { find('#ai-login-form').hidden = false; error('Sign in to Hibi before creating an AI plan.'); return; }
    if (!status.configured) { find('.ai-setup').hidden = false; error('OpenAI is not configured on the backend yet. No content has been sent.'); return; }
    if (!find('#ai-notes').value.trim() && !files.length) { error('Add a message, some notes, or a source file first.'); return; }
    busy = true;
    find('#ai-form').querySelectorAll('input, textarea, select, button').forEach((control) => { control.disabled = true; });
    controller = new AbortController();
    find('.ai-generate').disabled = true;
    find('.ai-generate span').textContent = 'Finding a way forward…';
    find('.ai-review-footer').hidden = true;
    find('#ai-preview').innerHTML = '<div class="ai-working"><span>✦</span><h2>A little thinking time.</h2><p>Reading your sources and connecting the next steps…</p></div>';
    try {
      const payload = {
        text: find('#ai-notes').value, goal: find('#ai-goal').value,
        project: find('#ai-project').value, files: await Promise.all(files.map(fileToSource)),
      };
      if (generation !== sessionGeneration) return;
      const result = await requestPlan(payload, controller.signal);
      if (generation !== sessionGeneration || !canUse()) return;
      plan = result;
      selected = new Set(plan.tasks.map((_, index) => index));
      imported = false;
      renderPlan();
    } catch (failure) {
      if (failure.name !== 'AbortError') error(failure.message);
      plan ? renderPlan() : renderEmpty();
    } finally {
      busy = false;
      find('#ai-form').querySelectorAll('input, textarea, select, button').forEach((control) => { control.disabled = false; });
      find('.ai-generate').disabled = recording;
      find('.ai-generate span').textContent = 'Create a plan';
    }
  });
  find('#ai-preview').addEventListener('input', (event) => {
    const article = event.target.closest('[data-task-index]');
    if (!article || !plan) return;
    const task = plan.tasks[Number(article.dataset.taskIndex)];
    const field = event.target.dataset.field;
    if (field) task[field] = field === 'checklist' ? event.target.value.split('\n').map((text) => text.trim()).filter(Boolean)
      : field === 'dueDate' ? event.target.value || null : event.target.value;
  });
  find('#ai-preview').addEventListener('change', (event) => {
    if (event.target.dataset.select === undefined) return;
    const index = Number(event.target.dataset.select);
    event.target.checked ? selected.add(index) : selected.delete(index);
    updateSelectedCount();
  });
  find('#ai-import').addEventListener('click', () => {
    if (!canUse() || !plan || imported || !selected.size || busy) return;
    if (plan.tasks.some((task, index) => selected.has(index) && !task.title.trim())) { error('Give each selected task a title before adding it.'); return; }
    const project = find('#ai-project').value;
    const tasks = createTasksFromPlan(plan, selected, project);
    if (onImport(tasks, project) === false) return;
    imported = true;
    updateSelectedCount();
    dialog.close();
    showToast(`${tasks.length} suggested ${tasks.length === 1 ? 'task' : 'tasks'} added to ${project}`);
  });

  function close() { controller?.abort(); voice.stop(true); dialog.close(); }
  find('.ai-close').addEventListener('click', close);
  dialog.addEventListener('cancel', () => { controller?.abort(); voice.stop(true); });

  async function open() {
    if (!canUse()) return;
    const state = getState();
    const current = find('#ai-project').value;
    find('#ai-project').innerHTML = state.projects.map((project) => `<option>${escape(project)}</option>`).join('');
    find('#ai-project').value = state.projects.includes(current) ? current : state.projects.includes(state.view) ? state.view : 'Personal';
    if (!dialog.open) dialog.showModal();
    if (!plan) renderEmpty();
    await checkStatus();
  }

  async function receiveSharedContent() {
    if (!canUse()) return;
    const url = new URL(location.href);
    const token = url.searchParams.get('share');
    if (!token) return;
    url.searchParams.delete('share');
    history.replaceState(null, '', url);
    await open();
    try {
      const shared = await consumeShare(token);
      find('#ai-notes').value = [find('#ai-notes').value, shared.text].filter(Boolean).join('\n\n');
      addFiles(shared.files.map((source) => {
        if (source instanceof Blob) return source;
        const binary = atob(source.data);
        return new File([Uint8Array.from(binary, (character) => character.charCodeAt(0))], source.name);
      }));
      showToast('Shared content received. Review it before creating a plan.');
    } catch (failure) { error(failure.message); }
  }

  renderEmpty();
  globalThis.addEventListener('hibi-session-changed', () => {
    sessionGeneration++;
    close();
    files = []; plan = null; selected.clear(); imported = false; status = null;
    find('#ai-form').reset();
    renderFiles(); renderEmpty(); error();
  });
  globalThis.addEventListener('hibi-workspace-ready', () => { void receiveSharedContent(); });
  receiveSharedContent();
  return { open, isOpen: () => dialog.open };
}
