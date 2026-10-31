// A single writer per tab; revision checks on Django protect against other tabs/devices.
export function createWorkspaceSync({ initial, persist, send, onStatus }) {
  let current = structuredClone(initial);
  let running = null;
  let blocked = false;
  let generation = 0;
  function edit(planner) {
    const next = { ...structuredClone(planner), revision: current.revision, dirty: true };
    persist(next); // Refuse the edit if a durable local copy cannot be saved.
    current = next;
    generation++;
    onStatus('Pending sync');
  }
  async function drain() {
    try {
      while (current.dirty && !blocked) {
        const version = generation;
        const result = await send({ tasks: current.tasks, projects: current.projects, revision: current.revision });
        current = { ...current, revision: result.revision, dirty: generation !== version };
        persist(current);
      }
      onStatus(blocked ? 'Conflict — reload latest' : 'Saved to your account');
      return !blocked;
    } catch (error) {
      blocked = error.status === 409;
      onStatus(blocked ? 'Conflict — reload latest' : 'Saved on device · retry sync');
      return false;
    }
  }
  function flush() {
    if (!running) running = drain().finally(() => { running = null; });
    return running;
  }
  return { edit, flush, snapshot: () => structuredClone(current) };
}
