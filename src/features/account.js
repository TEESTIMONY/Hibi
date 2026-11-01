import { API_BASE_URL } from '../config.js';
import { apiRequest, hasAPISession, signIn, signOut } from './ai/api.js';
import { createWorkspaceSync } from '../services/workspace-sync.js';
import { loadPlanner } from '../services/storage.js';
import { $, showToast } from '../utils/dom.js';

export function createAccount({ store }) {
  let user = null;
  let sync = null;
  let connecting = false;
  let epoch = 0;
  let registering = false;
  // Legacy device data is available only through explicit import after authentication.
  const guest = () => loadPlanner(localStorage, { tasks: [], projects: [] });
  const isReady = () => Boolean(user && sync && !connecting && hasAPISession());
  const status = (text) => { $('.saved').textContent = text; $('#account-sync-status').textContent = text; };
  const cacheKey = (id) => `hibi-account:${API_BASE_URL}:${id}`;
  const button = document.createElement('button');
  button.className = 'account-launch';
  button.textContent = 'Sign in';
  $('.profile').insertBefore(button, $('#theme'));
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'account-heading');
  dialog.innerHTML = `<button type="button" class="account-close" aria-label="Close account">×</button>
    <div class="account-welcome">Hibi<small>A little space for your day.</small></div>
    <h2 id="account-heading">Sign in to Hibi</h2>
    <p id="account-sync-status">Keep your day with you.</p>
    <form id="account-login"><div class="account-modes" role="group" aria-label="Account action">
    <button type="button" data-account-mode="signin" aria-pressed="true">Sign in</button>
    <button type="button" data-account-mode="register" aria-pressed="false">Create account</button></div>
    <label>Username<input name="username" autocomplete="username" required maxlength="150"></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
    <button type="submit">Sign in</button></form>
    <p id="account-error" role="alert"></p>
    <div id="account-tools" hidden><button type="button" id="account-retry">Retry sync</button>
    <button type="button" id="account-import">Import this device’s tasks</button>
    <button type="button" id="account-reload">Load latest account version</button>
    <button type="button" id="account-download">Download device copy / backup</button>
    <button type="button" id="account-logout">Sign out</button></div>`;
  document.body.append(dialog);
  const form = $('#account-login');
  const tools = $('#account-tools');
  const error = $('#account-error');
  const showError = (message) => { error.textContent = message; };
  function lock() {
    document.body.classList.add('auth-locked');
    dialog.setAttribute('closedby', 'none');
    document.querySelectorAll('dialog[open]').forEach((other) => { if (other !== dialog) other.close(); });
    if (!dialog.open) dialog.showModal();
  }
  function unlock() {
    document.body.classList.remove('auth-locked');
    dialog.removeAttribute('closedby');
    dialog.close();
    globalThis.dispatchEvent(new Event('hibi-workspace-ready'));
  }
  dialog.addEventListener('cancel', (event) => {
    if (document.body.classList.contains('auth-locked')) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (document.body.classList.contains('auth-locked')) queueMicrotask(() => {
      if (document.body.classList.contains('auth-locked') && !dialog.open) dialog.showModal();
    });
  });
  button.addEventListener('click', () => dialog.showModal());
  $('.account-close', dialog).addEventListener('click', () => { if (isReady()) dialog.close(); });
  function setMode(register) {
    registering = register;
    form.elements.password.autocomplete = register ? 'new-password' : 'current-password';
    $('#account-heading').textContent = register ? 'Create your Hibi account' : 'Sign in to Hibi';
    $('button[type="submit"]', form).textContent = register ? 'Create account' : 'Sign in';
    form.querySelectorAll('[data-account-mode]').forEach((mode) => {
      mode.setAttribute('aria-pressed', String((mode.dataset.accountMode === 'register') === register));
    });
    showError('');
  }
  form.querySelectorAll('[data-account-mode]').forEach((mode) => {
    mode.addEventListener('click', () => setMode(mode.dataset.accountMode === 'register'));
  });

  function attach(remote, cached = null) {
    const initial = cached?.dirty ? cached : { ...remote, projects: remote.projects.length ? remote.projects : ['Personal'], dirty: false };
    const ownerKey = cacheKey(user.id);
    const ownerEpoch = epoch;
    sync = createWorkspaceSync({ initial,
      persist: (value) => localStorage.setItem(ownerKey, JSON.stringify(value)),
      send: (body) => {
        if (ownerEpoch !== epoch) throw new Error('Account changed. Pending edits remain in the original account cache.');
        return apiRequest('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      },
      onStatus: (text) => { if (ownerEpoch === epoch) status(text); },
    });
    store.update({ tasks: initial.tasks, projects: initial.projects, view: 'Today', filter: 'all', search: '' });
    $('#account-import').hidden = remote.revision !== 0 || initial.tasks.length > 0;
    if (cached?.dirty && cached.revision !== remote.revision) {
      status('Conflict — reload latest');
      showError('This device has pending edits and the account has newer changes. Loading the account version preserves a backup of pending edits on this device.');
    } else if (initial.dirty) void sync.flush();
    else status('Saved to your account');
  }

  async function connect() {
    const requestEpoch = ++epoch;
    connecting = true;
    sync = null;
    user = null;
    lock();
    store.update({ tasks: [], projects: [], view: 'Today', filter: 'all', search: '' });
    try {
      if (!hasAPISession()) {
        user = null;
        button.textContent = 'Sign in';
        setMode(false);
        form.hidden = false;
        tools.hidden = true;
        status('Sign in to open your workspace.');
        return;
      }
      status('Opening your account…');
      form.hidden = true;
      tools.hidden = false;
      showError('');
      const identity = await apiRequest('/api/auth/me');
      const remote = await apiRequest('/api/workspace');
      if (requestEpoch !== epoch) return;
      user = identity;
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(cacheKey(user.id))); } catch { /* Cloud is authoritative without a valid local cache. */ }
      attach(remote, cached);
      button.textContent = user.username;
      $('#account-heading').textContent = 'Your Hibi account';
      form.hidden = true;
      tools.hidden = false;
      connecting = false;
      unlock();
    } catch (failure) {
      if (requestEpoch !== epoch) return;
      status('Account unavailable · sign in or retry');
      showError(failure.message);
      form.hidden = hasAPISession();
      tools.hidden = false;
    } finally { if (requestEpoch === epoch) connecting = false; }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('button[type="submit"]', form);
    const isRegistration = registering;
    submit.disabled = true;
    showError('');
    try {
      await signIn(form.elements.username.value.trim(), form.elements.password.value, isRegistration);
      form.elements.password.value = '';
    } catch (failure) {
      const duplicate = isRegistration && failure.details?.username?.some((message) => /already exists|already taken/i.test(message));
      showError(duplicate ? 'This username already has an account. Choose Sign in to use it, or pick a different username.' : failure.message);
    }
    finally { submit.disabled = false; }
  });
  $('#account-retry').addEventListener('click', () => { if (sync) void sync.flush(); else void connect(); });
  $('#account-import').addEventListener('click', () => {
    if (!sync || sync.snapshot().tasks.length || sync.snapshot().revision !== 0) return;
    const planner = guest();
    try { sync.edit(planner); store.update(planner); $('#account-import').hidden = true; void sync.flush(); }
    catch (failure) { showError(failure.message); }
  });
  $('#account-reload').addEventListener('click', async () => {
    if (!user || connecting) return;
    connecting = true;
    try {
      if (sync) await sync.flush();
      const pending = sync?.snapshot();
      if (pending?.dirty) localStorage.setItem(`${cacheKey(user.id)}:backup:${Date.now()}`, JSON.stringify(pending));
      const remote = await apiRequest('/api/workspace');
      localStorage.removeItem(cacheKey(user.id));
      attach(remote);
      showError('Latest account version loaded. Any pending edits were backed up on this device.');
    } catch (failure) { showError(failure.message); }
    finally { connecting = false; }
  });
  $('#account-download').addEventListener('click', () => {
    if (!user) return;
    try {
      const prefix = `${cacheKey(user.id)}:backup:`;
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)).sort();
      const copy = keys.length ? JSON.parse(localStorage.getItem(keys.at(-1))) : sync?.snapshot();
      if (!copy) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hibi-device-backup.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { showError(failure.message); }
  });
  $('#account-logout').addEventListener('click', async () => {
    if (connecting) return;
    if (sync?.snapshot().dirty && !await sync.flush()) {
      showError('Your changes are still pending. Retry sync before signing out.');
      return;
    }
    try { await signOut(); } catch (failure) { showError(failure.message); }
  });
  globalThis.addEventListener('hibi-session-changed', () => { void connect(); });
  globalThis.addEventListener('online', () => { if (sync) void sync.flush(); });
  globalThis.addEventListener('beforeunload', (event) => {
    if (sync?.snapshot().dirty) { event.preventDefault(); event.returnValue = ''; }
  });
  if (!API_BASE_URL) {
    lock();
    status('Sign in to open your workspace.');
    showError('Hibi cannot connect to its server yet. Please try again later.');
    $('button[type="submit"]', form).disabled = true;
  } else void connect();

  return {
    isReady,
    getUserId: () => user?.id ?? null,
    save(planner) {
      if (!isReady()) {
        showToast('Open your account and retry the connection before editing.');
        return false;
      }
      sync.edit({ tasks: planner.tasks, projects: planner.projects }); void sync.flush();
      return true;
    },
  };
}
