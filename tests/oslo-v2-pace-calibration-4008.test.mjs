import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const workouts = source.workouts;
const runs = workouts.filter(item => item.sport === "Run");

test("kalibracja 40:08 ustawia wszystkie zatwierdzone zakresy", () => {
  assert.deepEqual(source.paceCatalog, {
    recovery: { pace: "5:40–6:20/km", rpe: "2–3" },
    easy: { pace: "5:10–5:45/km", rpe: "3–4" },
    longEasy: { pace: "5:15–5:50/km", rpe: "3–4" },
    mediumLongEasy: { pace: "5:05–5:35/km", rpe: "3–4" },
    steady: { pace: "4:40–4:55/km", rpe: "5–6" },
    goalMarathonPace330: { pace: "4:55–5:02/km", rpe: "≤6", conditionalOnly: true },
    threshold: { pace: "4:12–4:20/km", rpe: "7" },
    tenKIntervals: { pace: "3:58–4:05/km", rpe: "7–8" },
    vo2Intervals: { pace: "3:45–3:55/km", rpe: "8–9", durationMinutes: "2–5" },
    warmup: { pace: "5:30–6:05/km", rpe: "2–3" },
    cooldown: { pace: "5:35–6:15/km", rpe: "2–3" },
  });
});

test("threshold, recovery, easy i long easy używają nowych targetów", () => {
  for (const item of runs.filter(workout => workout.workoutType === "THRESHOLD")) assert.match(item.paceDisplay, /4:12–4:20\/km/);
  for (const item of runs.filter(workout => workout.workoutType === "RECOVERY")) {
    assert.match(item.paceDisplay, /5:40–6:20\/km/);
    assert.match(item.paceDisplay, /RPE ma pierwszeństwo/);
  }
  for (const item of runs.filter(workout => /^LONG_RUN/.test(workout.workoutType))) {
    assert.ok(item.structuredSteps.filter(step => step.label === "Long easy").every(step => step.targetPace === "5:15–5:50/km"), item.id);
  }
  const easy = runs.find(item => item.workoutType === "EASY_STRIDES");
  assert.ok(easy.structuredSteps.some(step => step.label === "Easy" && step.targetPace === "5:10–5:45/km"));
});

test("goal MP jest warunkowe i oddzielone od threshold", () => {
  assert.equal(source.paceCatalog.goalMarathonPace330.conditionalOnly, true);
  for (const item of runs.filter(workout => workout.structuredSteps.some(step => step.targetPace === "4:55–5:02/km"))) {
    assert.equal(item.goalPaceConditional, true, item.id);
  }
  assert.notEqual(source.paceCatalog.threshold.pace, source.paceCatalog.goalMarathonPace330.pace);
});

test("stare progi i kategoria aktualnego wysiłku maratońskiego zniknęły", () => {
  const serialized = JSON.stringify(source).toLocaleLowerCase("pl");
  assert.doesNotMatch(serialized, /4:58–5:05\/km/);
  assert.doesNotMatch(serialized, /aktualn(?:y|ego|ym) wysił(?:ek|ku) maratoń/);
  assert.doesNotMatch(serialized, /5:15–5:25\/km/);
  assert.doesNotMatch(serialized, /5:15\/km-5:25\/km/);
});

test("podbiegi i rytmy pozostają effort-based bez targetu pace", () => {
  const effortWorkouts = runs.filter(item => item.effortBased);
  assert.ok(effortWorkouts.length > 0);
  for (const item of effortWorkouts) {
    for (const segment of item.structuredSteps.filter(step => step.kind === "repeat")) {
      assert.equal(segment.targetType, "effort", item.id);
      assert.equal(segment.targetPace, null, item.id);
    }
  }
});

test("korekta nie zmienia dat, dystansów, liczby ani podziału sesji", () => {
  const invariantFields = workouts.map(workout => ({
    id: workout.id,
    external_id: workout.external_id,
    date: workout.date,
    sport: workout.sport,
    parentId: workout.parentId,
    workoutType: workout.workoutType,
    distanceKm: workout.distanceKm ?? null,
    distanceRangeKm: workout.distanceRangeKm ?? null,
    durationMinutes: workout.durationMinutes ?? null,
    required: workout.required ?? null,
    optional: workout.optional ?? null,
    alternativeGroup: workout.alternativeGroup ?? null,
  }));
  const digest = crypto.createHash("sha256").update(JSON.stringify(invariantFields)).digest("hex");
  assert.equal(digest, "db2e3e39b57ac6a077bd2768c5d4090c0bb3282cdbcde3f1738ae5445a09a5df");
  assert.equal(workouts.length, 80);
  assert.equal(runs.length, 37);
  assert.equal(workouts.filter(item => item.sport === "Strength").length, 8);
});
