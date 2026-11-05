let nextId = 0;

export function addPasswordVisibility(root) {
  const hideAll = [];
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.password-field')) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'password-field';
    input.before(wrapper);
    wrapper.append(input);
    input.id ||= `hibi-password-${++nextId}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.setAttribute('aria-controls', input.id);
    button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="password-eye-slash" d="m3 3 18 18"/></svg>';
    function setVisible(visible) {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(visible));
      button.disabled = input.disabled;
    }
    button.addEventListener('click', () => setVisible(input.type === 'password'));
    wrapper.append(button);
    setVisible(false);
    hideAll.push(() => setVisible(false));
  });
  const hide = () => hideAll.forEach((reset) => reset());
  root.addEventListener('reset', hide, true);
  root.addEventListener('close', hide);
  return hide;
}
