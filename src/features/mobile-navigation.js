export function setupMobileNavigation() {
  const sidebar = document.querySelector('body > aside');
  const header = document.querySelector('main > header');
  const media = matchMedia('(max-width: 760px)');
  sidebar.id = 'workspace-navigation';
  const toggle = document.createElement('button');
  toggle.className = 'mobile-menu';
  toggle.textContent = '☰';
  toggle.setAttribute('aria-label', 'Open navigation');
  toggle.setAttribute('aria-controls', sidebar.id);
  toggle.setAttribute('aria-expanded', 'false');
  header.prepend(toggle);
  const close = document.createElement('button');
  close.className = 'mobile-nav-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close navigation');
  sidebar.prepend(close);
  const backdrop = document.createElement('button');
  backdrop.className = 'mobile-nav-backdrop';
  backdrop.setAttribute('aria-label', 'Close navigation');
  backdrop.hidden = true;
  document.body.append(backdrop);
  function setOpen(open) {
    document.body.classList.toggle('navigation-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    sidebar.inert = media.matches && !open;
    backdrop.hidden = !open;
    if (open) close.focus();
  }
  toggle.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  backdrop.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  sidebar.addEventListener('click', (event) => {
    if (media.matches && event.target.closest('[data-view], [data-action], .account-launch, .brand')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('navigation-open')) {
      setOpen(false); toggle.focus();
    }
  });
  media.addEventListener('change', () => setOpen(false));
  setOpen(false);
}
