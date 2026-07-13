import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('21. Auto-fill uruchamia się na starcie i po powrocie do karty', () => {
  assert.match(app, /autoFillLogsFromIntervals\(intervalsData\);renderAll\(\);showView\('dashboard'\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /syncIntervals\(false\)/);
});

test('22. Obiektywne dane wykonania są renderowane tylko do odczytu', () => {
  assert.match(app, /class="input objective" readonly/);
  assert.doesNotMatch(app, /id="logTime"/);
  assert.doesNotMatch(app, /id="logKm"/);
  assert.doesNotMatch(app, /id="logStatus"/);
});

test('23. Opcjonalna ocena jest w domyślnie zwiniętej sekcji', () => {
  assert.match(app, /<details class="manual-details"><summary>Moja ocena i notatki<\/summary>/);
  assert.doesNotMatch(app, /<details class="manual-details" open>/);
});

test('24. Teksty interfejsu nie sugerują ręcznego przepisywania treningu', () => {
  assert.match(app + html, /Dane wykonania synchronizują się automatycznie z Intervals\.icu/);
  assert.match(app + html, /Dodaj RPE \/ notatkę/);
  assert.doesNotMatch(app + html, /Uzupełnij dane po treningu/);
  assert.doesNotMatch(app + html, /\+ Wpisz trening/);
});
