import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const workouts = source.workouts;
const runs = workouts.filter(item => item.sport === "Run");

test("threshold ma spójne intensity, quality, mechanicalLoad i RPE", () => {
  const threshold = runs.filter(item => item.workoutType === "THRESHOLD");
  assert.ok(threshold.length > 0);
  for (const item of threshold) {
    assert.equal(item.intensity, "PROGOWY", item.id);
    assert.equal(item.quality, true, item.id);
    assert.equal(item.mechanicalLoad, "high", item.id);
    assert.equal(item.rpe, "7", item.id);
  }
  assert.equal(threshold.some(item => item.intensity === "ŁATWY"), false);
});

test("katalog obejmuje 10 km, VO2, goal MP, podbiegi i hill sprints", () => {
  assert.equal(source.intensityCatalog.tenKIntervals, "INTERWAŁOWY");
  assert.equal(source.intensityCatalog.vo2, "VO2");
  assert.equal(source.intensityCatalog.goalMarathonPace, "MARATOŃSKI");
  assert.equal(source.intensityCatalog.hillRepeats, "PODBIEGI");
  assert.equal(source.intensityCatalog.hillSprints, "SIŁA BIEGOWA");
});

test("easy, recovery, steady, MP i podbiegi mają właściwe intensity", () => {
  for (const item of runs.filter(workout => workout.workoutType === "RECOVERY")) {
    assert.equal(item.intensity, "REGENERACJA", item.id);
    assert.equal(item.quality, false, item.id);
    assert.equal(item.mechanicalLoad, "low", item.id);
  }
  for (const item of runs.filter(workout => workout.workoutType === "EASY_STRIDES")) assert.equal(item.intensity, "ŁATWY", item.id);
  for (const item of runs.filter(workout => workout.workoutType === "HILLS")) assert.equal(item.intensity, "PODBIEGI", item.id);
  for (const item of runs.filter(workout => /hill sprints/i.test(workout.name))) assert.equal(item.intensity, "SIŁA BIEGOWA", item.id);
  for (const item of runs.filter(workout => /steady/i.test(workout.name) && !workout.structuredSteps.some(step => step.targetPace === "4:55–5:02/km"))) {
    assert.equal(item.intensity, "UMIARKOWANY", item.id);
  }
  for (const item of runs.filter(workout => workout.structuredSteps.some(step => step.targetPace === "4:55–5:02/km"))) {
    assert.equal(item.intensity, "MARATOŃSKI", item.id);
  }
});

test("22 wskazane treningi otrzymują poprawione intensity", () => {
  const expectedByDate = {
    "2026-07-19": "REGENERACJA", "2026-07-21": "PROGOWY", "2026-07-23": "SIŁA BIEGOWA",
    "2026-07-26": "REGENERACJA", "2026-07-28": "PODBIEGI", "2026-07-30": "UMIARKOWANY",
    "2026-08-02": "REGENERACJA", "2026-08-04": "PROGOWY", "2026-08-09": "REGENERACJA",
    "2026-08-11": "PODBIEGI", "2026-08-13": "UMIARKOWANY", "2026-08-15": "MARATOŃSKI",
    "2026-08-16": "REGENERACJA", "2026-08-18": "PROGOWY", "2026-08-22": "UMIARKOWANY",
    "2026-08-23": "REGENERACJA", "2026-08-25": "MARATOŃSKI", "2026-08-27": "SIŁA BIEGOWA",
    "2026-08-30": "REGENERACJA", "2026-09-01": "MARATOŃSKI", "2026-09-06": "REGENERACJA",
    "2026-09-12": "MARATOŃSKI",
  };
  assert.equal(Object.keys(expectedByDate).length, 22);
  for (const [date, intensity] of Object.entries(expectedByDate)) {
    const item = runs.find(workout => workout.date === date && workout.required);
    assert.ok(item, date);
    assert.equal(item.intensity, intensity, item.id);
  }
});

test("daty, dystanse, targety tempa i external_id pozostają identyczne", () => {
  const invariant = workouts.map(workout => ({
    date: workout.date,
    distanceKm: workout.distanceKm ?? null,
    distanceRangeKm: workout.distanceRangeKm ?? null,
    external_id: workout.external_id,
    paceDisplay: workout.paceDisplay ?? null,
    steps: (workout.structuredSteps || []).map(step => ({
      kind: step.kind,
      distanceKm: step.distanceKm ?? null,
      durationSeconds: step.durationSeconds ?? null,
      durationMinutes: step.durationMinutes ?? null,
      repetitions: step.repetitions ?? null,
      targetType: step.targetType ?? null,
      targetPace: step.targetPace ?? null,
    })),
  }));
  const digest = crypto.createHash("sha256").update(JSON.stringify(invariant)).digest("hex");
  assert.equal(digest, "b77edc5b449a12e4c46d5ac7fa4519eae6f34c228d77f12a282b6220db087023");
});

test("UI kart i szczegółów korzysta z wygenerowanego intensity", async () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(await fs.readFile(path.join(root, "data/plan.js"), "utf8"), context);
  const plan = context.window.PLAN_DATA.items;
  for (const workout of workouts) {
    const item = plan.find(candidate => candidate.id === workout.external_id);
    assert.ok(item, workout.external_id);
    assert.equal(item.intensity, workout.intensity, workout.external_id);
  }
  const appSource = await fs.readFile(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /function workoutFull\(it,button=false\).*?<span class="pill">\$\{esc\(it\.intensity\)\}<\/span>/);
  assert.match(appSource, /function workoutRow\(it\).*?<span class="pill">\$\{esc\(it\.intensity\)\}<\/span>/);
  assert.match(appSource, /function calendarDay\(d,curM\).*?<div class="e-meta">\$\{esc\(x\.intensity\)\}/);
});
