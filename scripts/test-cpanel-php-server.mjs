import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const php = process.env.PHP_BIN || 'php';
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/cpanel-intervals-contract.json'), 'utf8'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-cpanel-test-'));
const configPath = path.join(temporary, 'config.php');
const cachePath = path.join(temporary, 'cache', 'latest.json');
fs.writeFileSync(configPath, `<?php\nreturn array(\n'interv` + `als_api_key' => 'fixture-key',\n'webhook_secret' => 'fixture-secret',\n'oldest_date' => '2026-06-01',\n'newest_date' => null,\n'wellness_days' => 120,\n'cache_ttl_seconds' => 7200,\n'allowed_origin' => 'http://127.0.0.1:8081',\n);\n`);

const mock = http.createServer((request, response) => {
  if (request.headers.authorization !== `Basic ${Buffer.from('API_KEY:fixture-key').toString('base64')}`) {
    response.writeHead(401).end('{}');
    return;
  }
  const key = request.url.includes('/activities?') ? 'activities' : request.url.includes('/events?') ? 'events' : 'wellness';
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(fixture[key]));
});
await new Promise((resolve, reject) => mock.listen(8091, '127.0.0.1', error => error ? reject(error) : resolve()));

const server = spawn(php, ['-S', '127.0.0.1:8081', '-t', path.join(root, 'dist/cpanel-coach')], {
  env: { ...process.env, COACH_CONFIG_PATH: configPath, COACH_CACHE_PATH: cachePath, COACH_TEST_MODE: '1', COACH_INTERVALS_API_BASE: 'http://127.0.0.1:8091' },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function getJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${url}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await getJson('http://127.0.0.1:8081/api/health.php');
      if (health.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error('PHP development server did not start.');
  const health = await getJson('http://127.0.0.1:8081/api/health.php');
  const live = await getJson('http://127.0.0.1:8081/api/intervals-sync.php?force=1');
  const cached = await getJson('http://127.0.0.1:8081/api/intervals-sync.php');
  const unauthorized = await fetch('http://127.0.0.1:8081/api/intervals-webhook.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const authorized = await getJson('http://127.0.0.1:8081/api/intervals-webhook.php', { method: 'POST', headers: { 'content-type': 'application/json', 'x-coach-webhook-secret': 'fixture-secret' }, body: '{"events":[{}]}' });
  if (live.source !== 'live' || live.snapshot.activities.length !== 2 || live.snapshot.eventsCount !== 2) throw new Error('Live fixture response mismatch.');
  if (cached.source !== 'cache') throw new Error('Fresh cache was not used.');
  if (unauthorized.status !== 401) throw new Error('Webhook did not reject an invalid secret.');
  if (!authorized.ok || authorized.reason !== 'webhook') throw new Error('Webhook did not refresh the fixture cache.');
  console.log(JSON.stringify({ ok: true, health, live: live.source, cached: cached.source, activities: live.snapshot.activities.length, eventsCount: live.snapshot.eventsCount, unauthorizedWebhook: unauthorized.status, authorizedWebhook: authorized.ok }, null, 2));
} finally {
  server.kill('SIGTERM');
  mock.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
