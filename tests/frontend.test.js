import test from 'node:test';
import assert from 'node:assert/strict';
import { createTasksFromPlan } from '../src/features/ai/plan-import.js';
import { getAIStatus } from '../src/features/ai/api.js';
import { getPublicConfig, renderPublicConfig } from '../scripts/frontend-config.js';

test('UI-only mode does not make an API request', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('No network should be used.'); };
  try {
    assert.deepEqual(await getAIStatus(), { configured: false, provider: 'OpenAI', backendConfigured: false });
  } finally { globalThis.fetch = original; }
});

test('only the public API origin enters the generated frontend configuration', () => {
  const output = renderPublicConfig(getPublicConfig({ HIBI_API_BASE_URL: 'https://api.example.com/', OPENAI_API_KEY: 'must-not-be-published' }));
  assert.match(output, /https:\/\/api.example.com/);
  assert.doesNotMatch(output, /must-not-be-published|OPENAI_API_KEY/);
});

test('deployed API origins must use HTTPS and cannot contain credentials or query strings', () => {
  assert.throws(() => getPublicConfig({ HIBI_API_BASE_URL: 'http://api.example.com' }), /HTTPS/);
  assert.throws(() => getPublicConfig({ HIBI_API_BASE_URL: 'https://name:password@api.example.com' }), /plain origin/);
  assert.throws(() => getPublicConfig({ HIBI_API_BASE_URL: 'https://api.example.com/?token=secret' }), /plain origin/);
  assert.equal(getPublicConfig({ HIBI_API_BASE_URL: 'http://127.0.0.1:8000' }).apiBaseUrl, 'http://127.0.0.1:8000');
});

test('only selected reviewed suggestions become browser tasks', () => {
  const task = { title: 'Write copy', notes: '', when: 'Anytime', dueDate: '2026-11-01', priority: 'medium', estimatedMinutes: 30, checklist: ['Draft'], sourceIds: ['source-1'] };
  const plan = { title: 'Launch plan', sources: [{ id: 'source-1', name: 'Notes' }], tasks: [task, { ...task, title: 'Not selected' }] };
  const tasks = createTasksFromPlan(plan, new Set([0]), 'Work', () => 'task-id');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Write copy');
  assert.equal(tasks[0].dueDate, '2026-11-01');
  assert.match(tasks[0].notes, /Notes/);
});
