import { API_BASE_URL } from '../../config.js';
import { consumeLocalShare } from './share-store.js';
import { apiErrorMessage } from '../../services/api-errors.js';
import { createSessionStore } from '../../services/session.js';

const session = createSessionStore(API_BASE_URL);
const getToken = session.get;
globalThis.addEventListener?.('storage', (event) => {
  if (event.key === session.key || event.key === null) globalThis.dispatchEvent(new Event('hibi-session-changed'));
});

export function hasAPISession() { return Boolean(getToken()); }

async function readResponse(response, sentToken) {
  if (response.status === 401 && sentToken && session.clear(sentToken)) {
    globalThis.dispatchEvent?.(new Event('hibi-session-changed'));
  }
  if (response.status === 204) return null;
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The Django API did not return JSON. Check the configured backend URL.'); }
  if (!response.ok) {
    const error = new Error(apiErrorMessage(body));
    error.status = response.status;
    error.details = body.details;
    throw error;
  }
  return body;
}

export function apiRequest(path, options = {}) {
  if (!API_BASE_URL) throw new Error('Hibi is not connected to its server yet. Please try again later.');
  const token = getToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}), ...options.headers },
    credentials: 'omit',
  }).then((response) => readResponse(response, token));
}

export async function getAIStatus() {
  if (!API_BASE_URL) return { configured: false, provider: 'OpenAI', backendConfigured: false };
  return { ...await apiRequest('/api/ai/status', { cache: 'no-store' }), backendConfigured: true };
}

export async function signIn(username, password, register = false, fields = {}) {
  const result = await apiRequest(register ? '/api/auth/register' : '/api/auth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, username, password }),
  });
  session.set(result.token);
  globalThis.dispatchEvent?.(new Event('hibi-session-changed'));
}

export async function signOut() {
  const token = getToken();
  try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
  finally {
    if (session.clear(token)) globalThis.dispatchEvent?.(new Event('hibi-session-changed'));
  }
}

export function requestPlan(payload, signal) {
  return apiRequest('/api/ai/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
}

export const consumeShare = consumeLocalShare;

export function fileToSource(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result.split(',')[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
