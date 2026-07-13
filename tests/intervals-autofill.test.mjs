import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

await import('../intervals-autofill-engine.js');
const engine = globalThis.IntervalsAutofillEngine;
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/intervals-autofill.json', import.meta.url), 'utf8'));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../data/plan.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../data/structured_workouts.js', import.meta.url), 'utf8'), context);
const items = context.window.PLAN_DATA.items;
const structuredWorkouts = context.window.STRUCTURED_WORKOUTS;

function sync(activities, state = {}) {
  return engine.sync({ items, structuredWorkouts, events: fixture.events, activities, logs: state.logs || {}, standalone: state.standalone || {} });
}

test('1. Run 7 lipca uzupełnia Bieg easy + rytmy', () => {
  const result = sync([fixture.activities.run0707]);
  assert.equal(result.matched[0].parentId, 'FA-2026-07-07-31');
  assert.equal(result.logs['FA-2026-07-07-31'].status, 'OK');
});

test('2. Ride 8 lipca uzupełnia regeneracyjny Tacx', () => {
  const result = sync([fixture.activities.ride0708]);
  const log = result.logs['FA-2026-07-08-32'];
  assert.equal(result.matched[0].parentId, 'FA-2026-07-08-32');
  assert.equal(log.status, 'OK');
  assert.equal(Object.values(log.parts)[0].avgWatts, 158);
});

test('3. Run 9 lipca uzupełnia tylko biegową część jednostki', () => {
  const result = sync([fixture.activities.run0709]);
  const log = result.logs['FA-2026-07-09-33'];
  assert.equal(log.status, 'Częściowo');
  assert.deepEqual(Object.keys(log.parts), ['opcoach-FA-2026-07-09-33-run']);
});

test('4. Swim 9 lipca uzupełnia część pływacką i domyka parent', () => {
  const result = sync([fixture.activities.run0709, fixture.activities.swim0709]);
  const log = result.logs['FA-2026-07-09-33'];
  assert.equal(log.status, 'OK');
  assert.equal(Object.keys(log.parts).length, 2);
});

test('5. START TESTOWY 10 km jest rozpoznawany jako Run', () => {
  const result = sync([fixture.activities.run0711]);
  assert.equal(engine.planSports(items.find(item => item.id === 'FA-2026-07-11-35'))[0], 'run');
  assert.equal(result.matched[0].parentId, 'FA-2026-07-11-35');
});

test('6. Ponowna synchronizacja aktualizuje wpis bez duplikatów i zachowuje pola ręczne', () => {
  const manual = { rpe: '7', pain: '1', sleep: '8', mental: '9', fuel: 'żel', shoes: 'Nimbus', notes: 'ręczna notatka' };
  const first = sync([fixture.activities.run0707], { logs: { 'FA-2026-07-07-31': manual } });
  const updated = { ...fixture.activities.run0707, moving_time: 2760, average_heartrate: 147 };
  const second = sync([updated], first);
  const log = second.logs['FA-2026-07-07-31'];
  assert.equal(Object.keys(log.parts).length, 1);
  assert.equal(Object.values(log.parts)[0].time, '46');
  for (const [key, value] of Object.entries(manual)) assert.equal(log[key], value);
});

test('7. Fallback dopasowuje tylko jednoznaczny przypadek', () => {
  const withoutRelation = { ...fixture.activities.run0707 };
  delete withoutRelation.paired_event_id;
  const unique = sync([withoutRelation]);
  const ambiguous = sync([fixture.activities.ambiguousRun]);
  assert.equal(unique.matched[0].method, 'fallback');
  assert.equal(ambiguous.matched.length, 0);
  assert.equal(ambiguous.standalone['activity-ambiguous-run'].status, 'Wymaga przypisania');
});

test('8. Run bez zaplanowanego biegu jest zapisany jako Poza planem', () => {
  const result = sync([fixture.activities.outsideRun]);
  assert.equal(result.standalone['activity-outside-run'].status, 'Poza planem');
  assert.equal(result.matched.length, 0);
});

test('9. Ride poza planem zachowuje dane wymagane przez dashboard i kalendarz', () => {
  const result = sync([fixture.activities.outsideRide]);
  const activity = result.standalone['activity-outside-ride'];
  assert.equal(activity.date, '2026-07-10');
  assert.equal(activity.sport, 'ride');
  assert.equal(activity.avgWatts, 180);
  assert.equal(activity.cadence, 88);
});

test('10. Ponowna synchronizacja aktywności poza planem nie tworzy duplikatu', () => {
  const first = sync([fixture.activities.outsideRide]);
  const second = sync([{ ...fixture.activities.outsideRide, icu_training_load: 47 }], first);
  assert.deepEqual(Object.keys(second.standalone), ['activity-outside-ride']);
  assert.equal(second.standalone['activity-outside-ride'].load, 47);
});

test('11. Niejednoznaczna aktywność wymaga przypisania i nie uzupełnia planu', () => {
  const result = sync([fixture.activities.ambiguousRun]);
  assert.equal(result.standalone['activity-ambiguous-run'].status, 'Wymaga przypisania');
  assert.ok(result.standalone['activity-ambiguous-run'].candidatePartIds.length > 1);
  assert.equal(Object.keys(result.logs).length, 0);
});

test('12. Statystyki obejmują aktywności dopasowane i poza planem', () => {
  const activities = [fixture.activities.run0707, fixture.activities.ride0708, fixture.activities.outsideRun, fixture.activities.outsideRide];
  const stats = engine.statistics(activities);
  assert.equal(stats.count, 4);
  assert.equal(stats.minutes, 45 + 50 + 30 + 60);
  assert.equal(stats.km, 8 + 22 + 5 + 30);
  assert.equal(stats.load, 42 + 30 + 25 + 45);
});

test('13. Dopasowana aktywność automatycznie wypełnia wszystkie dostępne statystyki', () => {
  const result = sync([fixture.activities.run0707]);
  const log = result.logs['FA-2026-07-07-31'];
  assert.equal(log.status, 'OK');
  assert.equal(log.activityName, 'Bieg easy + rytmy');
  assert.equal(log.activityStart, '2026-07-07T08:00:00');
  assert.equal(log.time, '45');
  assert.equal(log.km, '8');
  assert.equal(log.speed, 10.67);
  assert.equal(log.pace, 5.63);
  assert.equal(log.avgHr, 145);
  assert.equal(log.maxHr, 171);
  assert.equal(log.avgWatts, 268);
  assert.equal(log.normalizedWatts, 281);
  assert.equal(log.cadence, 176);
  assert.equal(log.elevation, 94);
  assert.equal(log.calories, 540);
  assert.equal(log.load, 42);
  assert.ok(Number(log.done) > 0);
  assert.equal(log.intervalsId, 'activity-run-0707');
  assert.equal(log.autoSource, 'Intervals auto');
  assert.ok(log.lastSyncedAt);
});

test('14. Odświeżenie strony zachowuje automatycznie uzupełnione dane', () => {
  const first = sync([fixture.activities.run0707]);
  const restored = {
    logs: JSON.parse(JSON.stringify(first.logs)),
    standalone: JSON.parse(JSON.stringify(first.standalone))
  };
  const afterRefresh = sync([fixture.activities.run0707], restored);
  assert.deepEqual(afterRefresh.logs['FA-2026-07-07-31'].autoActivityIds, first.logs['FA-2026-07-07-31'].autoActivityIds);
  assert.equal(afterRefresh.logs['FA-2026-07-07-31'].time, '45');
});

test('15. Druga synchronizacja tej samej aktywności nie tworzy duplikatu', () => {
  const first = sync([fixture.activities.run0707]);
  const second = sync([fixture.activities.run0707], first);
  const log = second.logs['FA-2026-07-07-31'];
  assert.equal(Object.keys(log.parts).length, 1);
  assert.equal(log.autoActivityIds, 'activity-run-0707');
  assert.equal(Object.keys(second.standalone).length, 0);
});

test('16. Aktualizacja tej samej aktywności aktualizuje dane wykonania', () => {
  const first = sync([fixture.activities.run0707]);
  const changed = { ...fixture.activities.run0707, moving_time: 2880, distance: 8500, max_heartrate: 175, icu_training_load: 49 };
  const second = sync([changed], first);
  const log = second.logs['FA-2026-07-07-31'];
  assert.equal(log.time, '48');
  assert.equal(log.km, '8.5');
  assert.equal(log.maxHr, 175);
  assert.equal(log.load, 49);
});

test('17. Ręczne RPE i prywatna notatka pozostają po synchronizacji', () => {
  const first = sync([fixture.activities.run0707], { logs: { 'FA-2026-07-07-31': { rpe: '8', notes: 'Tylko moja notatka' } } });
  const second = sync([{ ...fixture.activities.run0707, average_heartrate: 149 }], first);
  assert.equal(second.logs['FA-2026-07-07-31'].rpe, '8');
  assert.equal(second.logs['FA-2026-07-07-31'].notes, 'Tylko moja notatka');
  assert.equal(second.logs['FA-2026-07-07-31'].avgHr, 149);
});

test('18. Aktywność poza planem pojawia się automatycznie bez formularza', () => {
  const result = sync([fixture.activities.outsideRide]);
  const outside = result.standalone['activity-outside-ride'];
  assert.equal(outside.status, 'Poza planem');
  assert.equal(outside.intervalsId, 'activity-outside-ride');
  assert.equal(outside.autoSource, 'Intervals auto');
  assert.ok(outside.lastSyncedAt);
});

test('19. Rekord wymagający przypisania nie uzupełnia niewłaściwego treningu', () => {
  const result = sync([fixture.activities.ambiguousRun]);
  assert.equal(result.matched.length, 0);
  assert.equal(Object.keys(result.logs).length, 0);
  assert.equal(result.standalone['activity-ambiguous-run'].status, 'Wymaga przypisania');
});

test('20. Jednostka wielosportowa zachowuje osobno wykonane części', () => {
  const result = sync([fixture.activities.run0709, fixture.activities.swim0709]);
  const parts = result.logs['FA-2026-07-09-33'].parts;
  assert.equal(Object.keys(parts).length, 2);
  assert.equal(parts['opcoach-FA-2026-07-09-33-run'].activityName, 'Morning easy run');
  assert.equal(parts['opcoach-FA-2026-07-09-33-swim'].activityName, 'Evening technique swim');
  assert.notEqual(parts['opcoach-FA-2026-07-09-33-run'].intervalsId, parts['opcoach-FA-2026-07-09-33-swim'].intervalsId);
});
