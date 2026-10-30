import { mkdir, cp, copyFile, readdir, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve('.');
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Build output must be the project dist directory.');

// dist contains generated output only; source lives at the project root and in src.
await mkdir(output, { recursive: true });
for (const entry of await readdir(output)) {
  const target = resolve(output, entry);
  if (relative(output, target).startsWith('..')) throw new Error('Unsafe output path.');
  await rm(target, { recursive: true, force: true });
}
await copyFile(resolve(root, 'index.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'src'), resolve(output, 'src'), { recursive: true });
await cp(resolve(root, 'public'), resolve(output, 'public'), { recursive: true });
console.log('Built Hibi into dist/');
