import { API_BASE_URL } from '../../config.js';
import { consumeLocalShare } from './share-store.js';

const TOKEN_KEY = `hibi-api-token:${API_BASE_URL}`;

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  catch { return ''; }
}

export function hasAPISession() { return Boolean(getToken()); }

async function readResponse(response) {
  if (response.status === 204) return null;
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The Django API did not return JSON. Check the configured backend URL.'); }
  if (!response.ok) {
    if (response.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} }
    throw new Error(body.error || 'The API request could not be completed.');
  }
  return body;
}

function apiRequest(path, options = {}) {
  if (!API_BASE_URL) throw new Error('AI is not connected yet. The planner works in UI-only mode.');
  const token = getToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}), ...options.headers },
    credentials: 'omit',
  }).then(readResponse);
}

export async function getAIStatus() {
  if (!API_BASE_URL) return { configured: false, provider: 'OpenAI', backendConfigured: false };
  return { ...await apiRequest('/api/ai/status', { cache: 'no-store' }), backendConfigured: true };
}

export async function signIn(username, password) {
  const result = await apiRequest('/api/auth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  try { sessionStorage.setItem(TOKEN_KEY, result.token); }
  catch { throw new Error('Your browser could not save this session. Enable session storage to sign in.'); }
}

export async function signOut() {
  try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
  finally { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} }
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
