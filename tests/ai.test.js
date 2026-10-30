import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createOpenAI } from '../server/ai/openai.js';
import { validateIntake } from '../server/intake/sources.js';
import { validatePlan } from '../server/ai/plan-schema.js';
import { createApp } from '../server/app.js';
import { createTasksFromPlan } from '../src/features/ai/plan-import.js';

const config = { apiKey: 'test-key-not-real', model: 'test-model', transcriptionModel: 'test-transcribe', timeZone: 'Africa/Lagos' };
const suggestion = {
  title: 'Prepare the launch', summary: 'Draft the copy before reviewing the page.', assumptions: [], questions: ['Who approves the launch date?'],
  tasks: [{ title: 'Draft homepage copy', notes: 'Send for review.', when: 'Anytime', dueDate: null, priority: 'medium', estimatedMinutes: 45, checklist: ['Write draft', 'Review wording'], sourceIds: ['source-1'] }],
};

test('intake rejects empty content, unsupported files, malformed base64, and oversized notes', () => {
  assert.throws(() => validateIntake({}), /Add some notes/);
  assert.throws(() => validateIntake({ files: [{ name: 'bad.exe', data: 'aGk=' }] }), /use PDF/);
  assert.throws(() => validateIntake({ files: [{ name: 'note.txt', data: 'broken!' }] }), /decoded/);
  assert.throws(() => validateIntake({ text: 'x'.repeat(60001) }), /shorten/);
  assert.equal(validateIntake({ text: 'A note' }).files.length, 0);
});

test('mixed source input recognizes text, documents, and audio', () => {
  const files = ['notes.md', 'brief.pdf', 'brief.docx', 'voice.webm'].map((name) => ({ name, data: Buffer.from('test').toString('base64') }));
  assert.deepEqual(validateIntake({ files }).files.map((file) => file.kind), ['text', 'document', 'document', 'audio']);
});

test('AI requests are structured, use server credentials, and keep documents labeled', async () => {
  const calls = [];
  const ai = createOpenAI(config, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(suggestion) }] }] }));
  });
  const plan = await ai.suggestPlan(validateIntake({ text: 'Launch notes', files: [{ name: 'brief.pdf', data: 'dGVzdA==' }] }));
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.sources.length, 2);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.input[0].content.at(-1).type, 'input_file');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key-not-real');
  assert.match(payload.instructions, /untrusted evidence/);
});

test('voice is transcribed first, then included as a named planning source', async () => {
  const calls = [];
  const ai = createOpenAI(config, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('transcriptions') ? { text: 'Draft the homepage copy' }
      : { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(suggestion) }] }] }));
  });
  const result = await ai.suggestPlan(validateIntake({ files: [{ name: 'voice.webm', data: 'dGVzdA==' }] }));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get('model'), 'test-transcribe');
  assert.match(calls[1].options.body, /Draft the homepage copy/);
  assert.equal(result.sources[0].kind, 'audio');
});

test('refused or malformed AI output never becomes a plan', async () => {
  for (const content of [[{ type: 'refusal' }], [{ type: 'output_text', text: '{bad json' }]]) {
    const ai = createOpenAI(config, async () => new Response(JSON.stringify({ output: [{ content }] })));
    await assert.rejects(() => ai.suggestPlan(validateIntake({ text: 'A note' })), /declined|invalid plan/);
  }
  assert.throws(() => validatePlan({ ...suggestion, tasks: [{ ...suggestion.tasks[0], sourceIds: ['invented'] }] }, ['source-1']), /Invalid suggested task/);
});

test('only selected reviewed tasks are imported, preserving sources and deadlines', () => {
  const plan = { ...suggestion, tasks: [{ ...suggestion.tasks[0], dueDate: '2026-11-01' }, { ...suggestion.tasks[0], title: 'Not selected' }], sources: [{ id: 'source-1', name: 'Launch notes' }] };
  const tasks = createTasksFromPlan(plan, new Set([0]), 'Work', () => 'new-task');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'new-task');
  assert.equal(tasks[0].tag, 'Work');
  assert.equal(tasks[0].dueDate, '2026-11-01');
  assert.match(tasks[0].notes, /Launch notes/);
  assert.deepEqual(tasks[0].checks[0], { text: 'Write draft', done: false });
});

async function withServer(configuration, run, ai) {
  const server = createServer(createApp({ config: configuration, ai }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('unconfigured AI returns a setup error without exposing a key or pretending to generate', async () => {
  await withServer({ ...config, apiKey: '' }, async (base) => {
    const status = await (await fetch(`${base}/api/ai/status`)).json();
    assert.deepEqual(status, { configured: false, provider: 'OpenAI', model: 'test-model' });
    const response = await fetch(`${base}/api/ai/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Notes' }) });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Connect OpenAI/);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/server/config.js`)).status, 404);
  });
});

test('cross-site AI requests are rejected before model access', async () => {
  await withServer(config, async (base) => {
    const response = await fetch(`${base}/api/ai/plan`, { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  });
});

test('shared WhatsApp text and files survive redirect and can only be retrieved once', async () => {
  await withServer(config, async (base) => {
    const form = new FormData();
    form.append('text', 'Please draft the launch copy tomorrow');
    form.append('files', new Blob(['Project notes'], { type: 'text/plain' }), 'notes.txt');
    const response = await fetch(`${base}/share`, { method: 'POST', body: form, redirect: 'manual' });
    assert.equal(response.status, 303);
    const token = new URL(response.headers.get('location'), base).searchParams.get('share');
    const shared = await (await fetch(`${base}/api/shared/${token}`)).json();
    assert.match(shared.text, /launch copy/);
    assert.equal(shared.files[0].name, 'notes.txt');
    assert.equal(Buffer.from(shared.files[0].data, 'base64').toString(), 'Project notes');
    assert.equal((await fetch(`${base}/api/shared/${token}`)).status, 404);
  });
});

test('HTTP planning route uses the provider adapter and returns a reviewable plan', async () => {
  let received;
  await withServer(config, async (base) => {
    const response = await fetch(`${base}/api/ai/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Draft launch copy', project: 'Work' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, suggestion.title);
    assert.equal(received.project, 'Work');
  }, { suggestPlan: async (intake) => { received = intake; return { ...suggestion, sources: [{ id: 'source-1', name: 'Notes' }] }; } });
});
