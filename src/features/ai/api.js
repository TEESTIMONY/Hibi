async function readResponse(response) {
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The AI backend is unavailable. Start Hibi with npm run dev.'); }
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export function getAIStatus() {
  return fetch('/api/ai/status', { cache: 'no-store' }).then(readResponse);
}

export function requestPlan(payload, signal) {
  return fetch('/api/ai/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  }).then(readResponse);
}

export function consumeShare(token) {
  return fetch(`/api/shared/${encodeURIComponent(token)}`, { cache: 'no-store' }).then(readResponse);
}

export function fileToSource(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result.split(',')[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
