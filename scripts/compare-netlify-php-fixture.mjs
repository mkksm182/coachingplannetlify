import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'tests/fixtures/cpanel-intervals-contract.json');
const runnerPath = path.join(root, 'tests/fixtures/cpanel-contract-runner.php');
const php = process.env.PHP_BIN || 'php';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const timestamp = Math.floor(Date.now() / 1000);
const netlifySource = fs.readFileSync(path.join(root, 'netlify/functions/_intervals-core.mjs'), 'utf8')
  .replace("import { getStore } from '@netlify/blobs';", 'const getStore = () => ({ get: async () => null, setJSON: async () => {} });');
const temporaryCore = path.join(os.tmpdir(), `coach-netlify-core-${process.pid}.mjs`);
fs.writeFileSync(temporaryCore, netlifySource);
const { computeSnapshot } = await import(pathToFileURL(temporaryCore));
const expected = computeSnapshot(fixture);
const actual = JSON.parse(execFileSync(php, [runnerPath, fixturePath, String(timestamp)], { encoding: 'utf8' }));
fs.rmSync(temporaryCore, { force: true });

expected.syncedAt = actual.syncedAt;
expected.range = actual.range;
assert.deepEqual(actual, expected);
console.log(JSON.stringify({ ok: true, identical: true, activities: actual.activities.length, events: actual.events.length, eventsCount: actual.eventsCount }, null, 2));
