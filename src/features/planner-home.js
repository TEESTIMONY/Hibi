import { $ } from '../utils/dom.js';

export function createPlannerHome({ account, onNotes, onSchedule, onAdvanced }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'smart-schedule-dialog planner-home';
  dialog.setAttribute('aria-labelledby', 'planner-home-title');
  dialog.innerHTML = `<div class="smart-schedule-head"><div><small>HIBI PLANNER</small><h2 id="planner-home-title">What would help today?</h2></div><button type="button" data-close aria-label="Close planner">×</button></div>
    <p>Start with Hibi’s own planning tools. These work without OpenAI or an AI subscription.</p>
    <button type="button" data-notes><strong>Turn notes into tasks</strong><span>Paste a message, review clear actions and dates, then choose what to add.</span></button>
    <button type="button" data-schedule><strong>Plan my time</strong><span>Fit your existing tasks into available hours around deadlines and fixed commitments.</span></button>
    <details><summary>Optional advanced AI · Premium</summary><p>Deeper document analysis and voice transcription still use the separate OpenAI service and require server configuration. They are not part of Hibi’s rule-based tools.</p><button type="button" data-advanced>Open advanced AI</button></details>`;
  document.body.append(dialog);
  $('[data-close]', dialog).addEventListener('click', () => dialog.close());
  for (const [selector, action] of [['[data-notes]', onNotes], ['[data-schedule]', onSchedule], ['[data-advanced]', onAdvanced]]) {
    $(selector, dialog).addEventListener('click', () => { dialog.close(); if (account.isReady()) action(); });
  }
  globalThis.addEventListener('hibi-session-changed', () => dialog.close());
  return { open() { if (account.isReady()) dialog.showModal(); }, isOpen: () => dialog.open };
}
