import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('Dashboard pokazuje rekomendację, powody, wariant i zastrzeżenie', () => {
  assert.match(app, /Rekomendacja trenera/);
  assert.match(app, /recommendedVariant/);
  assert.match(app, /reasons\.slice\(0,3\)/);
  assert.match(app, /Rekomendacja nie zmienia automatycznie planu ani Intervals\.icu/);
});

test('szczegóły wykonania pokazują ocenę i brakujące dane', () => {
  assert.match(app, /Ocena wykonania/);
  assert.match(app, /Ocena wstępna/);
  assert.match(app, /brak danych okrążeń\/kroków/);
  assert.match(app, /executionAssessment/);
});

test('ręczne pola przeliczają podgląd na wejściu', () => {
  assert.match(app, /oninput=previewAdaptiveAssessment/);
  assert.match(app, /logRpe:'rpe'/);
  assert.match(app, /logPain:'pain'/);
  assert.match(app, /logSleep:'sleep'/);
});

test('Dashboard zawiera bramki 3:30 i historię pięciu ocen', () => {
  assert.match(app, /Bramki celu 3:30/);
  assert.match(app, /Ostatnie oceny/);
  assert.match(app, /adaptiveEntries\(\)\.slice\(0,5\)/);
});

test('moduł silnika jest ładowany przed aplikacją', () => {
  const engineAt = html.indexOf('adaptive-coach-engine.js');
  const appAt = html.indexOf('app.js?v=adaptive-coach-v1');
  assert.ok(engineAt > 0 && engineAt < appAt);
});

test('widoki adaptacyjne mają reguły mobilne', () => {
  assert.match(css, /@media \(max-width:720px\).*\.gate-grid/s);
  assert.match(css, /\.adaptive-history/);
  assert.match(css, /\.form-grid>\*\{min-width:0\}/);
});
