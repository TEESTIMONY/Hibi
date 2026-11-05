import { API_BASE_URL } from '../config.js';
import { apiRequest, hasAPISession, signIn, signOut } from './ai/api.js';
import { createWorkspaceSync } from '../services/workspace-sync.js';
import { loadPlanner } from '../services/storage.js';
import { $, showToast } from '../utils/dom.js';
import { addPasswordVisibility } from '../components/password-visibility.js';

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
    <div id="account-flash" class="account-flash" role="status" hidden><span></span><button type="button" aria-label="Dismiss message">×</button></div>
    <form id="account-login"><div class="account-modes" role="group" aria-label="Account action">
    <button type="button" data-account-mode="signin" aria-pressed="true">Sign in</button>
    <button type="button" data-account-mode="register" aria-pressed="false">Create account</button></div>
    <label><span data-identity-label>Username or email</span><input name="username" autocomplete="username" required maxlength="254"></label>
    <label data-registration hidden>Email<input name="email" type="email" autocomplete="email" maxlength="254" disabled></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
    <label data-registration hidden>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" maxlength="128" disabled></label>
    <button type="submit">Sign in</button>
    <button type="button" data-forgot>Forgot password?</button></form>
    <form id="account-recovery" hidden>
    <p>Enter your account email. We’ll send an 8-digit code that expires in 10 minutes.</p>
    <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
    <button type="button" data-reset-send>Send reset code</button>
    <label>Reset code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" minlength="8" maxlength="8" required></label>
    <label>New password<input name="password" type="password" autocomplete="new-password" required maxlength="128"></label>
    <label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" required maxlength="128"></label>
    <button type="submit">Reset password</button>
    <button type="button" data-reset-back>Back to sign in</button></form>
    <p id="account-error" role="alert"></p>
    <div id="account-tools" hidden>
    <form id="account-email"><h3>Recovery email</h3><p data-email-current></p>
    <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
    <label>Current password<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
    <button type="button" data-email-send>Send verification code</button>
    <label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label>
    <button type="submit">Verify and save email</button></form>
    <button type="button" id="account-retry">Retry sync</button>
    <button type="button" id="account-import">Import this device’s tasks</button>
    <button type="button" id="account-reload">Load latest account version</button>
    <button type="button" id="account-download">Download device copy / backup</button>
    <button type="button" id="account-logout">Sign out</button></div>`;
  document.body.append(dialog);
  const hidePasswords = addPasswordVisibility(dialog);
  const form = $('#account-login');
  const tools = $('#account-tools');
  const error = $('#account-error');
  const recovery = $('#account-recovery');
  const emailForm = $('#account-email');
  const flash = $('#account-flash');
  let flashTimer;
  function showFlash(message, kind = 'error') {
    clearTimeout(flashTimer);
    flash.hidden = !message;
    flash.dataset.kind = kind;
    flash.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    $('span', flash).textContent = message;
    if (message) flashTimer = setTimeout(() => { flash.hidden = true; }, 7000);
  }
  $('button', flash).addEventListener('click', () => { clearTimeout(flashTimer); flash.hidden = true; });
  const showError = (message) => { error.textContent = message; if (!message) showFlash(''); };
  const showSuccess = (message) => { error.textContent = ''; showFlash(message, 'success'); };
  const showFailure = (message) => { showError(message); showFlash(message); };
  [recovery, emailForm].forEach((target) => target.addEventListener('invalid', (event) => {
    showFailure(event.target.validationMessage || 'Please check the highlighted field.');
  }, true));
  const post = (path, data) => apiRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  async function submitAction(control, action, failureTitle = '') {
    control.disabled = true;
    showError('');
    try { await action(); } catch (failure) { showFailure(failureTitle ? `${failureTitle} ${failure.message || 'Please try again.'}` : failure.message); }
    finally { control.disabled = false; }
  }
  $('[data-forgot]', form).addEventListener('click', () => {
    hidePasswords();
    form.elements.password.value = ''; form.elements.confirmPassword.value = '';
    form.hidden = true; recovery.hidden = false;
    $('#account-heading').textContent = 'Reset your password'; showError('');
    recovery.elements.email.focus();
  });
  $('[data-reset-back]').addEventListener('click', () => {
    recovery.reset(); recovery.hidden = true; form.hidden = false; setMode(false);
  });
  $('[data-reset-send]').addEventListener('click', (event) => {
    if (!recovery.elements.email.reportValidity()) return;
    void submitAction(event.currentTarget, async () => {
      const result = await post('/api/auth/password-reset/request', { email: recovery.elements.email.value.trim() });
      showSuccess(result.message); recovery.elements.code.focus();
    }, 'Failed to send reset code.');
  });
  recovery.addEventListener('submit', (event) => {
    event.preventDefault();
    if (recovery.elements.password.value !== recovery.elements.confirmPassword.value) { showFailure('Passwords must match.'); return; }
    void submitAction($('button[type=submit]', recovery), async () => {
      const result = await post('/api/auth/password-reset/confirm', Object.fromEntries(new FormData(recovery)));
      recovery.reset(); recovery.hidden = true; form.hidden = false; setMode(false); showSuccess(result.message);
    }, 'Password reset failed.');
  });
  $('[data-email-send]').addEventListener('click', (event) => {
    if (!emailForm.elements.email.reportValidity() || !emailForm.elements.password.reportValidity()) return;
    void submitAction(event.currentTarget, async () => {
      const result = await post('/api/auth/email', { email: emailForm.elements.email.value.trim(), password: emailForm.elements.password.value });
      showSuccess(result.message); emailForm.elements.code.focus();
    });
  });
  emailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAction($('button[type=submit]', emailForm), async () => {
      const result = await post('/api/auth/email', Object.fromEntries(new FormData(emailForm)));
      user.email = result.email; emailForm.reset();
      $('[data-email-current]').textContent = result.email;
      showSuccess(result.message);
    });
  });
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
    $('[data-identity-label]', form).textContent = register ? 'Username' : 'Username or email';
    form.elements.username.maxLength = register ? 150 : 254;
    form.querySelectorAll('[data-registration]').forEach((label) => {
      label.hidden = !register;
      label.querySelector('input').disabled = !register;
      label.querySelector('input').required = register;
    });
    hidePasswords();
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
    recovery.hidden = true; recovery.reset(); emailForm.reset();
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
      $('[data-email-current]').textContent = user.email || 'Add an email so you can recover your account.';
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
      if (isRegistration && form.elements.password.value !== form.elements.confirmPassword.value) throw new Error('Passwords must match.');
      await signIn(form.elements.username.value.trim(), form.elements.password.value, isRegistration,
        isRegistration ? { email: form.elements.email.value.trim(), confirmPassword: form.elements.confirmPassword.value } : {});
      form.elements.password.value = '';
      form.elements.confirmPassword.value = '';
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
    async preparePlanning() {
      if (!isReady() || !await sync.flush() || !isReady()) throw new Error('Sync your account before planning.');
      return sync.snapshot().revision;
    },
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
