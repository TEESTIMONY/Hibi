import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(entries.map((entry) => (
    entry.isDirectory() ? collect(resolve(directory, entry.name)) : resolve(directory, entry.name)
  )));
  return results.flat();
}

const files = (await Promise.all(['src', 'server', 'public', 'scripts', 'tests'].map(collect))).flat();
for (const file of files.filter((file) => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    await readFile(resolve(dirname(file), match[1]));
  }
}
console.log('JavaScript syntax and relative module imports checked.');

// Catch unterminated strings/comments and broken delimiters before shipping CSS.
for (const file of files.filter((file) => file.endsWith('.css'))) {
  const source = await readFile(file, 'utf8');
  const stack = [];
  let quote = null;
  let comment = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === '*' && next === '/') { comment = false; index++; }
      continue;
    }
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '*') { comment = true; index++; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if ('{(['.includes(character)) stack.push(character);
    if ('})]'.includes(character)) {
      const expected = { '}': '{', ')': '(', ']': '[' }[character];
      if (stack.pop() !== expected) throw new Error(`Unbalanced CSS in ${file}`);
    }
  }
  if (quote || comment || stack.length) throw new Error(`Unterminated CSS in ${file}`);
  for (const match of source.matchAll(/@import\s+['"](\.[^'"]+)['"]/g)) {
    await readFile(resolve(dirname(file), match[1]));
  }
}
console.log('CSS delimiters and local stylesheet imports checked.');
