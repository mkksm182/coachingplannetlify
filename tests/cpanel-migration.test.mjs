import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('app.js');
const html = read('index.html');
const sw = read('sw.js');
const core = read('cpanel/public/api/_intervals-core.php');
const bootstrap = read('cpanel/public/api/_bootstrap.php');
const sync = read('cpanel/public/api/intervals-sync.php');
const health = read('cpanel/public/api/health.php');
const webhook = read('cpanel/public/api/intervals-webhook.php');
const htaccess = read('cpanel/public/.htaccess');
const phpFiles = fs.readdirSync(path.join(root, 'cpanel'), { recursive: true }).filter(file => String(file).endsWith('.php')).map(file => path.join('cpanel', String(file)));
const hasPhp = spawnSync('php', ['-v']).status === 0;

function localDataApi() {
  const context = { globalThis: {} };
  vm.runInNewContext(read('local-data-transfer.js'), context);
  return context.globalThis.CoachLocalData;
}

test('cPanel: wszystkie pliki PHP przechodzą kontrolę składni/zgodności', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/php-lint.mjs')], { stdio: 'pipe' });
  assert.ok(phpFiles.length >= 7);
});

test('cPanel: kod nie używa składni nowszej niż PHP 7.3', () => {
  const source = phpFiles.map(read).join('\n');
  assert.doesNotMatch(source, /\bfn\s*\(|\?->|\bmatch\s*\(|\bstr_contains\s*\(|\?\?=|#\[/);
});

test('cPanel: repozytorium i config example nie zawierają prawdziwych sekretów', () => {
  const example = read('cpanel/private/config.example.php');
  assert.match(example, /WKLEJ_KLUCZ_TUTAJ/);
  assert.match(example, /WYGENERUJ_DLUGI_LOSOWY_SEKRET/);
  assert.doesNotMatch(app + html + sw, /intervals_api_key|webhook_secret/);
});

test('cPanel: health zwraca wyłącznie bezpieczną diagnostykę', () => {
  for (const field of ['ok','php','curl','openssl','configFound','cacheWritable','hasIntervalsApiKey','now']) assert.match(health, new RegExp(`'${field}'`));
  assert.doesNotMatch(health, /echo\s+.*(?:config_path|cache_path|intervals_api_key)/i);
});

test('cPanel: sync bez konfiguracji ma bezpieczny błąd', () => {
  assert.match(bootstrap, /Private configuration is missing\./);
  assert.match(sync, /coach_safe_error/);
  assert.doesNotMatch(sync, /getTrace|print_r|var_dump/);
});

test('cPanel: fixture tworzy snapshot zgodny z Netlify, jeśli PHP CLI jest dostępne', { skip: !hasPhp }, async () => {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/compare-netlify-php-fixture.mjs')], { encoding: 'utf8' });
  assert.equal(JSON.parse(output).identical, true);
});

test('cPanel: mapowanie aktywności zachowuje pełny kontrakt AutoFill', () => {
  for (const field of ['id','external_id','paired_event_id','date','start_date_local','start_date','name','type','km','hours','moving_time','elapsed_time','load','avg_hr','max_hr','avg_watts','normalized_watts','cadence','elevation','calories','speed','pace','url']) assert.match(core, new RegExp(`'${field}'\\s*=>`));
});

test('cPanel: mapowanie wydarzeń zachowuje pełny kontrakt AutoFill', () => {
  for (const field of ['id','external_id','paired_activity_id','start_date_local','start_date','type','category','name','description','load','moving_time','distance']) assert.match(core, new RegExp(`'${field}'\\s*=>`));
});

test('cPanel: snapshot zawiera totals oraz last7/14/30', () => {
  for (const field of ['totals','last7','last14','last30','wellness','activities','events','eventsCount']) assert.match(core, new RegExp(`'${field}'\\s*=>`));
  assert.match(core, /coach_filter_since\(\$activities, 7/);
  assert.match(core, /coach_filter_since\(\$activities, 14/);
  assert.match(core, /coach_filter_since\(\$activities, 30/);
});

test('cPanel: cache jest atomowy i blokowany', () => {
  assert.match(core, /flock\(\$lock, LOCK_EX\)/);
  assert.match(core, /tempnam\(/);
  assert.match(core, /rename\(\$temporary, \$path\)/);
  assert.match(core, /JSON_UNESCAPED_UNICODE/);
});

test('cPanel: stary cache uruchamia live fetch', () => {
  assert.match(core, /coach_cache_is_fresh/);
  assert.match(core, /coach_fetch_snapshot\(\$config, \$fetcher, \$nowTimestamp\)/);
});

test('cPanel: awaria API zwraca stale cache', () => {
  assert.match(core, /'source' => 'stale-cache'/);
  assert.match(core, /'stale' => true/);
});

test('cPanel: force omija świeży cache', () => {
  assert.match(sync, /\$method === 'POST'.*\$_GET\['force'\]/s);
  assert.match(core, /if \(!\$force && coach_cache_is_fresh/);
});

test('cPanel: webhook odrzuca błędny sekret', () => {
  assert.match(webhook, /hash_equals\(\$expected, \$provided\)/);
  assert.match(webhook, /Unauthorized webhook secret.*401/s);
});

test('cPanel: poprawny webhook odświeża cache i nie loguje body', () => {
  assert.match(webhook, /coach_fetch_snapshot/);
  assert.doesNotMatch(webhook, /error_log\(.*\$raw|file_put_contents\(.*\$raw/);
});

test('cPanel: frontend nie wywołuje Netlify Functions', () => {
  assert.doesNotMatch(app + sw + html, /\.netlify\/functions/);
});

test('cPanel: frontend używa jednego centralnego API PHP', () => {
  assert.match(read('coach-config.js'), /apiBase:\s*'\/api'/);
  assert.match(app, /COACH_API_BASE/);
  assert.match(app, /intervals-sync\.php/);
});

test('cPanel: AutoFill i Adaptive Coach pozostają podłączone', () => {
  assert.match(app, /autoFillLogsFromIntervals/);
  assert.match(app, /AdaptiveCoachEngine/);
  assert.match(html, /intervals-autofill-engine\.js/);
  assert.match(html, /adaptive-coach-engine\.js/);
});

test('cPanel: plan i structured workouts nie są generowane przez pakowanie', () => {
  const builder = read('scripts/build-cpanel-package.mjs');
  assert.match(builder, /'data'/);
  assert.doesNotMatch(builder, /generate-training-artifacts|enrich-oslo/);
});

test('cPanel: eksport zawiera wyłącznie ręczne dane', () => {
  const api = localDataApi();
  const exported = api.createExport({ a: { rpe: 4, notes: 'ok', intervalsId: 'secret-activity', avgHr: 150 } }, {}, { light: true }, '2026-07-16T00:00:00Z');
  assert.deepEqual(JSON.parse(JSON.stringify(exported.planLogs)), { a: { rpe: 4, notes: 'ok' } });
  assert.doesNotMatch(JSON.stringify(exported), /secret-activity|avgHr|apiKey|secret/i);
});

test('cPanel: import zachowuje wszystkie ręczne pola', () => {
  const api = localDataApi();
  const fields = { rpe: 5, pain: 1, sleep: 8, mental: 7, fuel: 'żel', shoes: 'A', notes: 'dobrze' };
  const normalized = api.normalize({ kind: 'coach-center-local-data', planLogs: { a: fields } });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.planLogs.a)), fields);
});

test('cPanel: import zachowuje historię ocen bez identyfikatorów API', () => {
  const api = localDataApi();
  const exported = api.createExport({ a: { status: 'Wykonany', updated: '2026-07-16T10:00:00Z', autoSource: 'Intervals auto', completionPercentage: 100, load: 55, rpe: 4, intervalsId: 'a-1' } }, {}, {}, '2026-07-16T11:00:00Z');
  assert.deepEqual(JSON.parse(JSON.stringify(exported.planLogs.a)), { rpe: 4, status: 'Wykonany', updated: '2026-07-16T10:00:00Z', autoSource: 'Intervals auto', completionPercentage: 100, load: 55 });
  assert.doesNotMatch(JSON.stringify(exported), /intervalsId|a-1/);
});

test('cPanel: ponowny import nie tworzy duplikatów', () => {
  const api = localDataApi();
  const once = api.merge({ a: { status: 'Wykonany' } }, { a: { rpe: 4 } });
  const twice = api.merge(once, { a: { rpe: 4 } });
  assert.equal(Object.keys(twice).length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.a)), { status: 'Wykonany', rpe: 4 });
});

test('cPanel: htaccess blokuje prywatne pliki i listowanie', () => {
  assert.match(htaccess, /Options -Indexes/);
  for (const token of ['^_','env','git','backup','config','latest','log']) assert.match(htaccess.toLowerCase(), new RegExp(token.replace('^','\\^')));
  assert.doesNotMatch(htaccess, /\|config\(\\\.\|\$\)/);
  assert.ok(fs.existsSync(path.join(root, 'dist/cpanel-coach/coach-config.js')));
});

test('cPanel: paczka nie zawiera sekretów, backupów ani plików developerskich', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-cpanel-package.mjs')], { stdio: 'pipe' });
  const output = path.join(root, 'dist/cpanel-coach');
  const names = fs.readdirSync(output, { recursive: true }).map(String);
  assert.equal(names.some(name => /node_modules|\.git|tests|scripts|backups|config\.php$|source_plan|\.xlsx$/i.test(name)), false);
  const combined = names.filter(name => fs.statSync(path.join(output, name)).isFile()).map(name => fs.readFileSync(path.join(output, name))).join('\n');
  assert.doesNotMatch(combined, /intervals_api_key\s*['"]?\s*=>\s*['"](?!WKLEJ)/i);
});

test('cPanel: service worker ma nową wersję i nie cacheuje API', () => {
  assert.match(sw, /v12-cpanel-php/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(read('manifest.json'), /"scope": "\/"/);
});

test('cPanel: reguły mobilne pozostają bez regresji', () => {
  const css = read('style.css');
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /min-width:0/);
});

test('cPanel: build uruchomiony dwukrotnie daje identyczny ZIP', () => {
  const build = () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/build-cpanel-package.mjs')], { stdio: 'pipe' });
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/coach-michalikstudio-cpanel.zip'))).digest('hex');
  };
  assert.equal(build(), build());
});
