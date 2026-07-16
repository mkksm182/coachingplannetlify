import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function phpFiles(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await phpFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.php')) result.push(absolute);
  }
  return result;
}

const files = await phpFiles(path.join(root, 'cpanel'));
const forbidden = [
  [/\bfn\s*\(/, 'arrow function'],
  [/\?->/, 'nullsafe operator'],
  [/\bmatch\s*\(/, 'match expression'],
  [/\bstr_contains\s*\(/, 'str_contains'],
  [/\?\?=/, 'null coalescing assignment'],
  [/#\[/, 'attribute syntax'],
  [/\b(?:public|protected|private)\s+(?:static\s+)?[A-Za-z_\\][A-Za-z0-9_\\]*\s+\$/, 'typed property'],
  [/[A-Za-z_\\][A-Za-z0-9_\\]*\|[A-Za-z_\\][A-Za-z0-9_\\]*\s+\$/, 'union type']
];
const compatibilityProblems = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) compatibilityProblems.push(`${path.relative(root, file)}: ${label}`);
  }
}
if (compatibilityProblems.length) {
  console.error(JSON.stringify({ ok: false, compatibilityProblems }, null, 2));
  process.exit(1);
}

const probe = spawnSync('php', ['-v'], { encoding: 'utf8' });
let runtime = false;
const linted = [];
if (!probe.error && probe.status === 0) {
  runtime = true;
  for (const file of files) {
    const result = spawnSync('php', ['-l', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout);
      process.exit(result.status || 1);
    }
    linted.push(path.relative(root, file));
  }
}
console.log(JSON.stringify({ ok: true, php73Compatible: true, runtime, files: files.map(file => path.relative(root, file)), linted }, null, 2));
