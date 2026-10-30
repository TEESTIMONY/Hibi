import { HttpError } from '../http.js';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export const MAX_SOURCES = 8;
const DOCUMENTS = new Map([
  ['pdf', 'application/pdf'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);
const TEXT = new Set(['txt', 'md', 'csv', 'json']);
const AUDIO = new Map([
  ['mp3', 'audio/mpeg'], ['mp4', 'audio/mp4'], ['m4a', 'audio/mp4'],
  ['wav', 'audio/wav'], ['webm', 'audio/webm'], ['mpeg', 'audio/mpeg'],
]);

export function decodeFile(file) {
  if (!file || typeof file.name !== 'string' || typeof file.data !== 'string') {
    throw new HttpError(400, 'A source file is incomplete.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || file.data.length % 4 !== 0) {
    throw new HttpError(400, 'A source file could not be decoded.');
  }
  const bytes = Buffer.from(file.data, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    throw new HttpError(413, 'Each source file must be non-empty and no larger than 8 MB.');
  }
  const name = file.name.replace(/[\x00-\x1f]/g, '').slice(0, 180);
  const extension = name.split('.').pop().toLowerCase();
  if (!DOCUMENTS.has(extension) && !TEXT.has(extension) && !AUDIO.has(extension)) {
    throw new HttpError(415, `${name}: use PDF, DOCX, TXT, MD, CSV, JSON, MP3, M4A, MP4, WAV, or WebM.`);
  }
  return {
    name, bytes, extension,
    mime: DOCUMENTS.get(extension) || AUDIO.get(extension) || 'text/plain',
    kind: AUDIO.has(extension) ? 'audio' : TEXT.has(extension) ? 'text' : 'document',
  };
}

export function validateIntake(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Add a message or a source file.');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const project = typeof body.project === 'string' ? body.project.trim().slice(0, 100) : 'Personal';
  if (text.length > 60000 || goal.length > 2000) throw new HttpError(413, 'Please shorten the notes or planning instructions.');
  if (!Array.isArray(body.files ?? []) || (body.files?.length ?? 0) > MAX_SOURCES) {
    throw new HttpError(400, 'Use no more than eight source files at once.');
  }
  const files = (body.files ?? []).map(decodeFile);
  if (files.reduce((sum, file) => sum + file.bytes.length, 0) > MAX_TOTAL_BYTES) {
    throw new HttpError(413, 'Source files must total no more than 12 MB.');
  }
  if (!text && !files.length) throw new HttpError(400, 'Add some notes, a message, or at least one file.');
  if (files.filter((file) => file.kind === 'text').some((file) => file.bytes.length > 100000)) {
    throw new HttpError(413, 'Text files must be under 100 KB. Split larger notes into smaller selections.');
  }
  return { text, goal, project: project || 'Personal', files };
}
