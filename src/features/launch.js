export function revealPlanner() {
  const screen = document.querySelector('#launch-screen');
  if (!screen) return;
  // A dedicated preview lets the opening design stay visible for inspection.
  if (new URLSearchParams(globalThis.location?.search ?? '').get('preview') === 'opening') return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimumDuration = reducedMotion ? 0 : 2800;
  const remaining = Math.max(0, minimumDuration - performance.now());

  setTimeout(() => {
    document.body.classList.remove('is-launching');
    screen.classList.add('leaving');
    setTimeout(() => { screen.hidden = true; }, reducedMotion ? 0 : 350);
  }, remaining);
}
