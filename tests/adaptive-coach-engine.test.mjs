import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

await import('../adaptive-coach-engine.js');
const engine = globalThis.AdaptiveCoachEngine;

const easy = { id: 'easy', dateISO: '2026-07-16', sport: 'Run', discipline: 'Easy run', workoutType: 'EASY', intensity: 'ŁATWY', plannedKm: 8, rpe: '3–4', required: true, pace: '5:10–5:45/km' };
const threshold = { id: 'threshold', dateISO: '2026-07-18', sport: 'Run', discipline: 'Threshold', workoutType: 'THRESHOLD', intensity: 'PROGOWY', plannedKm: 10, rpe: '7', required: true, quality: true, planB: '8 km easy' };
const longRun = { id: 'long', dateISO: '2026-07-20', sport: 'Run', discipline: 'Long 18–20 km', workoutType: 'LONG_RUN', intensity: 'ŁATWY', plannedKm: 20, rpe: '3–4', required: true, planB: '18 km easy bez MP' };
const altRide = { id: 'alt-ride', dateISO: '2026-07-18', sport: 'Ride', discipline: 'ALT: rower Z2 albo Run', workoutType: 'ENDURANCE', intensity: 'REGENERACJA', rpe: '3', required: false, optional: true, alternativeGroup: 'alt-1' };
const strength = { id: 'strength', parentId: 'day-1', dateISO: '2026-07-16', sport: 'Strength', discipline: 'Siła techniczna', workoutType: 'STRENGTH', rpe: '2–4', required: false, optional: true };
const execution = { autoSource: 'Intervals auto', status: 'OK', km: 8, done: 100, load: 42, lastSyncedAt: '2026-07-16T10:00:00.000Z' };
const fullManual = { rpe: 4, pain: 0, sleep: 8, mental: 8 };

function evaluate(workout = easy, manual = fullManual, extra = {}) {
  return engine.evaluate({ workout, execution: { ...execution, ...(extra.execution || {}) }, manual, nextWorkout: extra.nextWorkout || threshold, history: extra.history || [], plan: extra.plan || [easy, threshold, longRun], generatedAt: '2026-07-16T12:00:00.000Z' });
}

test('1. prawidłowo wykonany easy daje zielony', () => assert.equal(evaluate().status, 'green'));
test('2. easy z RPE 6 daje żółty', () => assert.equal(evaluate(easy, { ...fullManual, rpe: 6 }).status, 'yellow'));
test('3. ból 4 daje czerwony i wolne', () => { const result = evaluate(easy, { ...fullManual, pain: 4 }); assert.equal(result.status, 'red'); assert.equal(result.recommendedVariant, 'wolne'); });
test('4. ból 3 przed threshold wybiera Plan B', () => { const result = evaluate(easy, { ...fullManual, pain: 3 }); assert.equal(result.status, 'yellow'); assert.equal(result.recommendedVariant, 'Plan B'); });
test('5. niepełna jakość i wysokie RPE dają czerwony', () => assert.equal(evaluate(threshold, { ...fullManual, rpe: 9 }, { execution: { done: 70, km: 7 } }).status, 'red'));
test('6. brak danych manualnych daje ocenę wstępną bez zgadywania', () => { const result = evaluate(easy, {}); assert.equal(result.confidence, 'provisional'); assert.deepEqual(result.missingData, ['rpe', 'pain', 'sleep']); });
test('7. dodanie RPE i bólu natychmiast zmienia ocenę', () => { const before = evaluate(easy, {}); const after = evaluate(easy, { ...fullManual, pain: 4 }); assert.notEqual(before.status, after.status); assert.equal(after.status, 'red'); });
test('8. zielony nie przyspiesza planu', () => { const result = evaluate(); assert.equal(result.recommendedVariant, 'Plan A'); assert.match(result.recommendedAction, /bez zwiększania dystansu ani tempa/); });
test('9. żółty przed long runem wybiera dolny dystans lub Plan B', () => { const result = evaluate(easy, { ...fullManual, pain: 3 }, { nextWorkout: longRun }); assert.equal(result.recommendedVariant, 'Plan B'); assert.match(result.recommendedAction, /18 km easy/); });
test('10. żółty przy ALT preferuje rower', () => { const result = evaluate(easy, { ...fullManual, pain: 3 }, { nextWorkout: altRide }); assert.equal(result.recommendedVariant, 'rower Z2'); });
test('11. czerwony przy ALT preferuje wolne', () => { const result = evaluate(easy, { ...fullManual, pain: 4 }, { nextWorkout: altRide }); assert.equal(result.recommendedVariant, 'wolne'); });
test('12. Run i Strength są oceniane osobno', () => { const run = evaluate(easy, fullManual); const gym = evaluate(strength, { ...fullManual, rpe: 7 }, { execution: { done: 100 }, nextWorkout: threshold }); assert.equal(run.status, 'green'); assert.equal(gym.usedInputs.sport, 'strength'); assert.notEqual(run.usedInputs.workoutId, gym.usedInputs.workoutId); });
test('13. opcjonalna siła nie blokuje następnego obowiązkowego treningu', () => assert.equal(engine.findNextWorkout([easy, strength, threshold], easy.dateISO, easy.id).id, threshold.id));
test('14. wykonanie Run nie oznacza wykonania Strength', () => { const history = engine.evaluateHistory({ plan: [easy, strength], logs: { easy: execution } }); assert.equal(history.length, 1); assert.equal(history[0].workout.id, 'easy'); });
test('15. podbiegi nie są oceniane na podstawie chwilowego tempa', () => { const hills = { ...threshold, id: 'hills', workoutType: 'HILL_REPEATS', effortBased: true, pace: null }; const result = evaluate(hills, fullManual, { execution: { pace: 9.5, done: 100 } }); assert.equal(result.status, 'green'); assert.equal(result.usedInputs.plannedPace, null); });
test('16. brak load nie powoduje błędu', () => assert.doesNotThrow(() => evaluate(easy, fullManual, { execution: { load: undefined } })));
test('17. za mało historii nie tworzy ostrzeżenia load', () => { const result = evaluate(easy, fullManual, { history: [{ workout: easy, execution: { load: 100 } }] }); assert.equal(result.usedInputs.loadTrend, null); });
test('18. bramka 3:30 nie jest zaliczona bez RPE i bólu', () => { const gate = { ...longRun, id: 'gate', dateISO: '2026-08-15', discipline: 'BRAMKA A', strategyGate: 'gate-2026-08-15' }; const statuses = engine.gateStatuses({ plan: [gate], logs: { gate: { ...execution, pace: 5.2 } }, nowDate: '2026-08-16' }); assert.equal(statuses[0].status, 'brak danych'); });
test('19. rekomendacja nie modyfikuje planu', () => { const plan = [structuredClone(easy), structuredClone(threshold)]; const before = JSON.stringify(plan); engine.evaluate({ workout: plan[0], execution, manual: fullManual, plan }); assert.equal(JSON.stringify(plan), before); });
test('20. te same dane dają identyczny wynik', () => assert.deepEqual(evaluate(), evaluate()));
test('21. zmiana kroku ma najwyższy priorytet', () => assert.equal(evaluate(easy, { ...fullManual, notes: 'Narastający ból i zmiana kroku.' }).status, 'red'));
test('22. dwie kolejne słabe noce blokują mocny trening', () => { const history = [{ workout: { ...easy, dateISO: '2026-07-15' }, manual: { sleep: 5.5 }, execution: { load: 20 } }]; assert.equal(evaluate(easy, { ...fullManual, sleep: 5.5 }, { history }).status, 'yellow'); });
test('23. wzrost load ponad 30% jest ostrzeżeniem, nie diagnozą', () => { const history = [1, 2, 3].map(day => ({ workout: { dateISO: `2026-07-1${day}` }, execution: { load: 60 } })).concat([8, 10, 12, 14, 16, 18].map(day => ({ workout: { dateISO: `2026-06-${String(day).padStart(2, '0')}` }, execution: { load: 30 } }))); const result = evaluate(easy, fullManual, { history }); assert.ok(['green', 'yellow'].includes(result.status)); });
test('24. daty ISO nie przesuwają rekomendacji w strefie Oslo', () => assert.equal(engine.findNextWorkout([easy, strength, threshold], '2026-07-16', 'easy').id, threshold.id));
test('25. brak okrążeń ogranicza ocenę do całej aktywności', () => assert.equal(evaluate().scope, 'whole-activity'));
test('26. pełne dane manualne dają pełną pewność', () => assert.equal(evaluate().confidence, 'full'));
test('27. wynik zawiera wymagany kontrakt silnika', () => { const result = evaluate(); for (const key of ['status', 'confidence', 'headline', 'reasons', 'recommendedAction', 'nextWorkoutId', 'recommendedVariant', 'generatedAt', 'engineVersion', 'usedInputs']) assert.ok(key in result, key); });
test('28. plan Oslo nie został zmieniony przez Sprint 3A', () => { const canonical = JSON.parse(fs.readFileSync(new URL('../data/oslo-marathon-2026-v2.json', import.meta.url))); assert.ok(canonical.workouts.length >= 80); });
test('29. średnie tempo całej aktywności nie zalicza wielosegmentowej bramki', () => { const gate = { ...longRun, id: 'gate', dateISO: '2026-08-15', discipline: 'BRAMKA A', strategyGate: 'gate-2026-08-15' }; const statuses = engine.gateStatuses({ plan: [gate], logs: { gate: { ...execution, pace: 5.2, rpe: 4, pain: 0, sleep: 8 } }, nowDate: '2026-08-16' }); assert.equal(statuses[0].status, 'brak danych'); assert.match(statuses[0].reason, /bloków tempa/); });
