import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const output = path.join(dist, 'cpanel-coach');
const zipPath = path.join(dist, 'coach-michalikstudio-cpanel.zip');
const fixedTime = new Date('2020-01-01T00:00:00Z');

const publicEntries = [
  'index.html',
  'coach-config.js',
  'app.js',
  'local-data-transfer.js',
  'adaptive-coach-engine.js',
  'intervals-autofill-engine.js',
  'style.css',
  'sw.js',
  'manifest.json',
  'assets',
  'data'
];

const publicGarminFiles = [
  'intervals_payload.json',
  'intervals_payload_structured.json',
  'plan_google.ics',
  'plan_intervals.ics',
  'plan_intervals_structured.ics',
  'plan_intervals_structured_with_notes.ics'
];

async function copyEntry(entry) {
  await cp(path.join(root, entry), path.join(output, entry), {
    recursive: true,
    force: true,
    preserveTimestamps: false
  });
}

async function filesBelow(directory, prefix = '') {
  const names = (await readdir(directory)).sort();
  const files = [];
  for (const name of names) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const info = await stat(absolute);
    if (info.isDirectory()) files.push(...await filesBelow(absolute, relative));
    else if (info.isFile()) files.push(relative);
  }
  return files;
}

async function normalizeTree(directory) {
  for (const relative of await filesBelow(directory)) {
    const absolute = path.join(directory, relative);
    await chmod(absolute, relative.endsWith('.php') ? 0o644 : 0o644);
    await utimes(absolute, fixedTime, fixedTime);
  }
}

await rm(output, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(output, { recursive: true });
for (const entry of publicEntries) await copyEntry(entry);
await mkdir(path.join(output, 'garmin'), { recursive: true });
for (const file of publicGarminFiles) {
  await cp(path.join(root, 'garmin', file), path.join(output, 'garmin', file), { force: true });
}
await cp(path.join(root, 'cpanel/public/api'), path.join(output, 'api'), { recursive: true, force: true });
await cp(path.join(root, 'cpanel/cron'), path.join(output, 'cron'), { recursive: true, force: true });
await cp(path.join(root, 'cpanel/public/.htaccess'), path.join(output, '.htaccess'), { force: true });
await normalizeTree(output);

const files = await filesBelow(output);
const forbidden = files.filter(file => /(^|\/)(node_modules|tests?|scripts?|backups?|\.git)(\/|$)|config\.php$|source_plan|\.xlsx$|netlify/i.test(file));
if (forbidden.length) throw new Error(`Forbidden package files: ${forbidden.join(', ')}`);

execFileSync('/usr/bin/zip', ['-X', '-q', zipPath, ...files], { cwd: output, stdio: 'inherit' });
console.log(JSON.stringify({ output, zipPath, files: files.length }, null, 2));
