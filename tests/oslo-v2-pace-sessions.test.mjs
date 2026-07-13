import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

await import("../intervals-autofill-engine.js");
const engine = globalThis.IntervalsAutofillEngine;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(await fs.readFile(path.join(root, "data/plan.js"), "utf8"), context);
vm.runInContext(await fs.readFile(path.join(root, "data/structured_workouts.js"), "utf8"), context);
const plan = context.window.PLAN_DATA.items;
const structured = context.window.STRUCTURED_WORKOUTS;
const workouts = source.workouts;
const futurePlan = plan.filter(item => item.dateISO >= source.range.start && item.dateISO <= source.range.end);
const futureStructured = structured.filter(item => item.dateISO >= source.range.start && item.dateISO <= source.range.end);
const appSource = await fs.readFile(path.join(root, "app.js"), "utf8");

function runActivity(externalId, date, name = "Test Run") {
  return { id: `activity-${externalId}`, external_id: externalId, start_date_local: `${date}T07:00:00`, type: "Run", name, moving_time: 3600, distance: 10000 };
}

test("każdy Run ma pełny paceDisplay albo jawne effortBased", () => {
  for (const item of workouts.filter(workout => workout.sport === "Run")) {
    assert.ok(item.paceDisplay || item.effortBased, item.id);
    assert.match(item.paceDisplay, /Rozgrzewka:/, item.id);
    assert.match(item.paceDisplay, /Część główna(?:\s—[^:]+)?:/, item.id);
    assert.match(item.paceDisplay, /Przerwy:/, item.id);
    assert.match(item.paceDisplay, /Schłodzenie:/, item.id);
    assert.match(item.paceDisplay, /RPE/, item.id);
    assert.ok(item.structuredSteps.every(step => step.sport === "Run"), item.id);
  }
});

test("każdy long run ma target tempa dla każdego segmentu biegowego", () => {
  for (const item of workouts.filter(workout => workout.workoutType.startsWith("LONG"))) {
    for (const segment of item.structuredSteps.filter(step => ["warmup", "main", "conditional", "cooldown"].includes(step.kind))) {
      assert.equal(segment.targetType, "pace", `${item.id}: ${segment.label}`);
      assert.match(segment.targetPace, /\d:\d{2}–\d:\d{2}\/km|albo wolniej/, `${item.id}: ${segment.label}`);
    }
  }
});

test("katalog i treningi zawierają zatwierdzone zakresy tempa", () => {
  assert.equal(source.paceCatalog.threshold.pace, "4:58–5:05/km");
  assert.equal(source.paceCatalog.tenKIntervals.pace, "4:43–4:50/km");
  assert.equal(source.paceCatalog.recovery.pace, "6:15–6:45/km");
  assert.equal(source.paceCatalog.goalMarathonPace330.pace, "4:58–5:03/km");
  assert.equal(source.paceCatalog.goalMarathonPace330.conditionalOnly, true);
  for (const item of workouts.filter(workout => workout.workoutType === "THRESHOLD")) assert.match(item.paceDisplay, /4:58–5:05\/km/);
  for (const item of workouts.filter(workout => workout.workoutType === "RECOVERY")) assert.match(item.paceDisplay, /6:15–6:45\/km/);
  for (const item of workouts.filter(workout => workout.sport === "Run" && workout.paceDisplay.includes("4:58–5:03/km"))) assert.equal(item.goalPaceConditional, true, item.id);
});

test("podbiegi, hill sprints i rytmy nie mają targetu pace na szybkim odcinku", () => {
  const effortWorkouts = workouts.filter(item => item.effortBased);
  assert.ok(effortWorkouts.length > 0);
  for (const item of effortWorkouts) {
    const efforts = item.structuredSteps.filter(step => step.kind === "repeat");
    assert.ok(efforts.length > 0, item.id);
    assert.ok(efforts.every(step => step.targetType === "effort" && step.targetPace === null), item.id);
    assert.doesNotMatch(item.structuredWorkoutText, /(?:Uphill|Fast relaxed)[^\n]*\d:\d{2}\/km/i, item.id);
  }
  for (const item of workouts.filter(workout => workout.workoutType === "HILLS" || /hill sprint/i.test(workout.name))) {
    assert.match(item.paceDisplay, /nie kontroluj tempa chwilowego/);
  }
});

test("plan zachowuje jeden rekord i jedną kartę na każdą sesję", () => {
  assert.equal(futurePlan.length, workouts.length);
  assert.deepEqual(new Set(futurePlan.map(item => item.id)), new Set(workouts.map(item => item.external_id)));
  for (const item of workouts) {
    const generated = futurePlan.find(planItem => planItem.id === item.external_id);
    assert.ok(generated, item.external_id);
    assert.equal(generated.discipline, item.name);
    assert.equal(generated.sport, item.sport);
    assert.equal(generated.parentId, item.parentId);
  }
});

test("kalendarz porównuje lokalną datę bez przesunięcia UTC", () => {
  assert.match(appSource, /function iso\(d\)\{return \[d\.getFullYear\(\),String\(d\.getMonth\(\)\+1\).*d\.getDate\(\)/);
  assert.doesNotMatch(appSource, /function iso\(d\)\{return d\.toISOString\(\)/);
});

test("Run + Strength są osobnymi rekordami ze wspólnym parentId", () => {
  const groups = Map.groupBy ? Map.groupBy(workouts, item => item.parentId) : workouts.reduce((map, item) => map.set(item.parentId, [...(map.get(item.parentId) || []), item]), new Map());
  const mixed = [...groups.values()].filter(items => items.some(item => item.sport === "Run") && items.some(item => item.sport === "Strength"));
  assert.ok(mixed.length > 0);
  for (const items of mixed) {
    assert.equal(new Set(items.map(item => item.parentId)).size, 1);
    assert.ok(items.find(item => item.sport === "Run").external_id.endsWith("run-1"));
    assert.ok(items.find(item => item.sport === "Strength").external_id.endsWith("strength-1"));
  }
});

test("model rozdziela także Ride + T2 Run oraz Run + Swim", () => {
  const syntheticItems = [
    { id: "brick-ride", parentId: "brick-parent", dateISO: "2026-08-01", discipline: "Ride", required: true },
    { id: "brick-run", parentId: "brick-parent", dateISO: "2026-08-01", discipline: "T2 Run", required: true },
    { id: "combo-run", parentId: "combo-parent", dateISO: "2026-08-02", discipline: "Run", required: true },
    { id: "combo-swim", parentId: "combo-parent", dateISO: "2026-08-02", discipline: "Swim", required: true },
  ];
  const syntheticStructured = [
    { id: "brick-ride", parentId: "brick-parent", dateISO: "2026-08-01", type: "Ride", title: "Ride", category: "WORKOUT" },
    { id: "brick-run", parentId: "brick-parent", dateISO: "2026-08-01", type: "Run", title: "T2 Run", category: "WORKOUT" },
    { id: "combo-run", parentId: "combo-parent", dateISO: "2026-08-02", type: "Run", title: "Run", category: "WORKOUT" },
    { id: "combo-swim", parentId: "combo-parent", dateISO: "2026-08-02", type: "Swim", title: "Swim", category: "WORKOUT" },
  ];
  const parts = engine.makeParts(syntheticItems, syntheticStructured);
  assert.deepEqual(parts.filter(item => item.parentId === "brick-parent").map(item => item.sport).sort(), ["ride", "run"]);
  assert.deepEqual(parts.filter(item => item.parentId === "combo-parent").map(item => item.sport).sort(), ["run", "swim"]);
});

test("wykonanie Run nie wykonuje opcjonalnej Strength i nie obniża statusu parenta", () => {
  const runId = "cc-v2-oslo-2026-2026-07-16-run-1";
  const strengthId = "cc-v2-oslo-2026-2026-07-16-strength-1";
  const result = engine.sync({ items: plan, structuredWorkouts: structured, activities: [runActivity(runId, "2026-07-16")], events: [], logs: {}, standalone: {} });
  assert.equal(result.logs[runId].status, "OK");
  assert.equal(result.logs[strengthId], undefined);
  assert.equal(result.logs["cc-v2-oslo-2026-2026-07-16"].status, "OK");
  assert.equal(result.logs["cc-v2-oslo-2026-2026-07-16"].parentStatus, "Wykonany");
});

test("ALT wybiera jedną opcję i oznacza drugą jako niewymaganą", () => {
  const runId = "cc-v2-oslo-2026-2026-08-12-run-alt";
  const rideId = "cc-v2-oslo-2026-2026-08-12-ride-alt";
  const result = engine.sync({ items: plan, structuredWorkouts: structured, activities: [runActivity(runId, "2026-08-12", "Recovery ALT")], events: [], logs: {}, standalone: {} });
  assert.equal(result.logs[runId].status, "OK");
  assert.equal(result.logs[rideId].status, "Niewymagana / wybrano inną opcję");
  assert.equal(result.logs["cc-v2-oslo-2026-2026-08-12"].parentStatus, "Wykonany");
});

test("Intervals JSON i ICS zawierają osobne wydarzenia dla każdej sesji", async () => {
  const payload = JSON.parse(await fs.readFile(path.join(root, "garmin/intervals_payload_structured.json"), "utf8"));
  const desired = payload.filter(item => item.start_date_local.slice(0, 10) >= source.range.start && item.start_date_local.slice(0, 10) <= source.range.end);
  assert.equal(desired.length, workouts.length);
  assert.equal(new Set(desired.map(item => item.external_id)).size, workouts.length);
  const ics = await fs.readFile(path.join(root, "garmin/plan_intervals_structured_with_notes.ics"), "utf8");
  for (const id of workouts.map(item => item.external_id)) assert.match(ics, new RegExp(`UID:${id}@coach-center\\.local`));
});

test("Garmin structured workouts mają jeden sport i poprawną składnię", () => {
  for (const item of futureStructured.filter(event => event.category === "WORKOUT")) {
    assert.equal(new Set([item.sport, ...item.structuredSteps.map(step => step.sport)]).size, 1, item.id);
    assert.match(item.builderText, /^-/m, item.id);
  }
});
