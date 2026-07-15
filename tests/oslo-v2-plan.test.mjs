import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { generateArtifacts, GENERATED_FILES } from "../scripts/generate-training-artifacts.mjs";
import { buildSyncPlan, isOldProjectEvent } from "../scripts/sync-oslo-v2-to-intervals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const baseline = JSON.parse(await fs.readFile(path.join(root, "tests/fixtures/oslo-v2-baseline-hashes.json"), "utf8"));
const workouts = source.workouts;
const dateOf = value => new Date(`${value}T12:00:00Z`);

async function loadWindow(file, key) {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, file), "utf8"), context);
  return JSON.parse(JSON.stringify(context.window[key]));
}

const plan = await loadWindow("data/plan.js", "PLAN_DATA");
const structured = await loadWindow("data/structured_workouts.js", "STRUCTURED_WORKOUTS");
const appSource = await fs.readFile(path.join(root, "app.js"), "utf8");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function datesBetween(start, end) {
  const result = [];
  for (const cursor = dateOf(start); cursor <= dateOf(end); cursor.setUTCDate(cursor.getUTCDate() + 1)) result.push(cursor.toISOString().slice(0, 10));
  return result;
}

function monday(date) {
  const value = dateOf(date);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

function byWeek(items) {
  return items.reduce((map, item) => {
    const key = monday(item.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
}

test("kanoniczne źródło pokrywa każdy dzień 15.07–12.09 i ma poprawne dni tygodnia", () => {
  assert.deepEqual([...new Set(workouts.map(item => item.date))], datesBetween("2026-07-15", "2026-09-12"));
  const names = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
  for (const item of workouts) assert.equal(item.dayName, names[dateOf(item.date).getUTCDay()], item.id);
});

test("każdy rekord ma komplet wymaganych pól i stabilny external_id", () => {
  const required = ["id", "parentId", "external_id", "date", "time", "sport", "name", "workoutType", "distanceKm", "durationMinutes", "intensity", "pace", "rpe", "elevationM", "warmup", "mainSet", "recovery", "cooldown", "fuel", "planB", "optional", "conditions", "structuredWorkoutText"];
  for (const item of workouts) for (const field of required) assert.ok(Object.hasOwn(item, field), `${item.id}: ${field}`);
  assert.equal(new Set(workouts.map(item => item.external_id)).size, workouts.length);
  assert.ok(workouts.every(item => item.id === item.external_id && item.id.startsWith(`cc-v2-oslo-2026-${item.date}-`)));
});

test("brak obowiązkowego basenu, a ALT nie zwiększa kilometrażu", () => {
  assert.equal(workouts.filter(item => item.sport === "Swim" && item.required).length, 0);
  for (const item of workouts.filter(item => item.alternativeGroup)) assert.equal(item.optional, true, item.id);
  for (const item of structured.filter(item => item.dateISO >= "2026-07-15" && item.dateISO <= "2026-09-12" && item.optional)) assert.equal(item.plannedKm, "", item.id);
  const groups = workouts.filter(item => item.alternativeGroup).reduce((map, item) => {
    if (!map.has(item.alternativeGroup)) map.set(item.alternativeGroup, []);
    map.get(item.alternativeGroup).push(item);
    return map;
  }, new Map());
  for (const [group, items] of groups) {
    assert.ok(items.every(item => item.optional), group);
    assert.equal(items.filter(item => item.required).length, 0, group);
  }
});

test("pełne tygodnie mają maksymalnie cztery obowiązkowe biegi", () => {
  const weeks = byWeek(workouts.filter(item => item.sport === "Run" && item.required));
  for (const start of ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]) {
    assert.equal(weeks.get(start)?.length, 4, start);
  }
});

test("przed 10.08 nie ma piątego ani opcjonalnego środowego biegu", () => {
  const earlyRuns = workouts.filter(item => item.sport === "Run" && item.date < "2026-08-10");
  assert.equal(earlyRuns.filter(item => item.optional).length, 0);
  assert.equal(earlyRuns.filter(item => dateOf(item.date).getUTCDay() === 3).length, 0);
});

test("w tygodniu są najwyżej dwa ciężkie bodźce mechaniczne", () => {
  for (const [week, items] of byWeek(workouts.filter(item => item.quality && item.mechanicalLoad === "high"))) {
    assert.ok(items.length <= 2, `${week}: ${items.map(item => item.name).join(", ")}`);
  }
});

test("siła jest lekka i nigdy ciężka dzień przed long runem", () => {
  const longs = new Set(workouts.filter(item => item.workoutType.startsWith("LONG")).map(item => item.date));
  for (const item of workouts.filter(item => item.sport === "Strength")) {
    assert.equal(item.mechanicalLoad, "low", item.id);
    const tomorrow = dateOf(item.date); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    assert.equal(longs.has(tomorrow.toISOString().slice(0, 10)), false, item.id);
  }
  assert.ok(workouts.filter(item => item.sport === "Strength" && item.date <= "2026-07-27").every(item => item.durationMinutes <= 18));
});

test("zatwierdzone long runy i bramki mają dokładne warunki", () => {
  const jul18 = workouts.find(item => item.date === "2026-07-18" && item.sport === "Run");
  const aug15 = workouts.find(item => item.date === "2026-08-15" && item.sport === "Run");
  const aug22 = workouts.find(item => item.date === "2026-08-22" && item.sport === "Run");
  assert.equal(jul18.distanceKm, 12);
  assert.deepEqual(aug15.distanceRangeKm, [18, 20]);
  assert.match(aug15.conditions, /bólu? 0–2\/10/);
  assert.match(aug15.conditions, /RPE ≤4/);
  assert.match(aug15.conditions, /braku pogorszenia następnego ranka/);
  assert.deepEqual(aug22.distanceRangeKm, [22, 24]);
  assert.match(aug22.conditions, /24 km tylko po zaliczeniu 15\.08/);
  assert.match(aug22.planB, /jeden blok 3 km steady/);
});

test("taper kończy się startem 12.09, a decyzja A/B/C jest 02.09", () => {
  assert.equal(source.range.end, "2026-09-12");
  assert.deepEqual(source.finalDecision, { date: "2026-09-02", basedOn: ["2026-08-15", "2026-08-22", "2026-09-01"] });
  assert.deepEqual(source.raceStrategies.map(item => item.target), ["3:30", "3:42–3:45", "3:48–3:55"]);
  const race = workouts.find(item => item.date === "2026-09-12" && item.workoutType === "RACE");
  assert.ok(race);
  assert.match(race.conditions, /Plan A 3:30 tylko po zaliczeniu bramek/);
});

test("szczegóły treningu pokazują pełny Plan B i warunki", () => {
  assert.match(appSource, /<b>Plan B \/ warunki<\/b><p>\$\{esc\(it\.modification\)\}<\/p>/);
});

test("structured workouty jakościowe mają rozgrzewkę, pracę, odpoczynek i schłodzenie", () => {
  const qualityTypes = new Set(["THRESHOLD", "HILLS", "MARATHON_PACE_GATE"]);
  for (const item of workouts.filter(item => qualityTypes.has(item.workoutType))) {
    assert.match(item.structuredWorkoutText, /- Warmup/i, item.id);
    assert.match(item.structuredWorkoutText, /\d+x/, item.id);
    assert.match(item.structuredWorkoutText, /Recovery/i, item.id);
    assert.match(item.structuredWorkoutText, /- Cooldown/i, item.id);
  }
  const continuous = workouts.find(item => item.workoutType === "MARATHON_EFFORT");
  assert.match(continuous.structuredWorkoutText, /- Warmup/i);
  assert.match(continuous.structuredWorkoutText, /Steady 6km/i);
  assert.match(continuous.structuredWorkoutText, /Conditional goal MP/i);
  assert.match(continuous.structuredWorkoutText, /- Cooldown/i);
  for (const item of workouts.filter(item => item.workoutType === "HILLS" || item.workoutType === "EASY_STRIDES")) {
    assert.doesNotMatch(item.structuredWorkoutText, /Uphill[^\n]*\d:\d{2}\/km/i, item.id);
    assert.match(item.structuredWorkoutText, /Full/i, item.id);
  }
  for (const event of structured.filter(item => item.dateISO >= "2026-07-15" && item.dateISO <= "2026-09-12" && item.category === "WORKOUT")) {
    assert.match(event.builderText, /^-/m, event.id);
  }
});

test("historia przed 15.07 i wszystko po 12.09 pozostały bez zmian", () => {
  assert.equal(hash(plan.items.filter(item => item.dateISO < "2026-07-15")), baseline.planBefore);
  assert.equal(hash(plan.items.filter(item => item.dateISO > "2026-09-12")), baseline.planAfter);
  assert.equal(hash(structured.filter(item => item.dateISO < "2026-07-15")), baseline.structuredBefore);
  assert.equal(hash(structured.filter(item => item.dateISO > "2026-09-12")), baseline.structuredAfter);
});

test("generator uruchomiony dwa razy daje identyczne artefakty", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "oslo-v2-generator-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await generateArtifacts({ outputRoot: temp, baselineRoot: root });
  await fs.mkdir(path.join(temp, "data"), { recursive: true });
  await fs.copyFile(path.join(root, "data/oslo-marathon-2026-v2.json"), path.join(temp, "data/oslo-marathon-2026-v2.json"));
  const first = new Map();
  for (const file of GENERATED_FILES) first.set(file, hash(await fs.readFile(path.join(temp, file))));
  await generateArtifacts({ outputRoot: temp, baselineRoot: temp });
  for (const file of GENERATED_FILES) assert.equal(hash(await fs.readFile(path.join(temp, file))), first.get(file), file);
});

test("plan DRY RUN usuwa tylko stare ID projektu i jest idempotentny", async () => {
  const desired = JSON.parse(await fs.readFile(path.join(root, "garmin/intervals_payload_structured.json"), "utf8")).filter(item => item.start_date_local.slice(0, 10) >= "2026-07-15" && item.start_date_local.slice(0, 10) <= "2026-09-12");
  const old = [
    { id: 1, external_id: "opcoach-FA-2026-07-18-42-run", start_date_local: "2026-07-18T08:00:00", name: "old" },
    { id: 2, start_date_local: "2026-07-18T08:00:00", name: "manual" },
    { id: 3, external_id: "opcoach-FA-2026-07-14-38-run", start_date_local: "2026-07-14T08:00:00", name: "history" },
  ];
  assert.equal(isOldProjectEvent(old[0]), true);
  assert.equal(isOldProjectEvent(old[1]), false);
  assert.equal(isOldProjectEvent(old[2]), false);
  const first = buildSyncPlan(old, desired);
  assert.equal(first.remove.length, 1);
  assert.equal(first.add.length, desired.length);
  const second = buildSyncPlan(desired, desired);
  assert.deepEqual({ remove: second.remove.length, update: second.update.length, add: second.add.length }, { remove: 0, update: 0, add: 0 });
});
