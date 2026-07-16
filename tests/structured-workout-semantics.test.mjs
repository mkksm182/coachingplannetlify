import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSyncPlan } from "../scripts/sync-oslo-v2-to-intervals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const payload = JSON.parse(await fs.readFile(path.join(root, "garmin/intervals_payload_structured.json"), "utf8"));
const baseline = JSON.parse(await fs.readFile(path.join(root, "tests/fixtures/oslo-v2-structured-workout-baseline.json"), "utf8"));
const broken = JSON.parse(await fs.readFile(path.join(root, "tests/fixtures/oslo-v2-broken-comparable-events.json"), "utf8"));
const generator = await fs.readFile(path.join(root, "scripts/enrich-oslo-v2-paces.mjs"), "utf8");

const sourceById = new Map(source.workouts.map(item => [item.external_id, item]));
const payloadById = new Map(payload.map(item => [item.external_id, item]));

function semanticStep(line) {
  const value = line.replace(/^\s*-\s*/, "").trim();
  const duration = value.match(/(?:^|\s)(\d+(?:\.\d+)?)(km|m|s)(?=\s|$)/);
  const pace = value.match(/\d:\d{2}\/km-\d:\d{2}\/km Pace/);
  const power = value.match(/\d+(?:\.\d+)?-\d+(?:\.\d+)?%/);
  const cadence = value.match(/\d+(?:\.\d+)?-\d+(?:\.\d+)?rpm/);
  const rpe = value.match(/\d+(?:-\d+)? RPE/);
  return {
    duration: duration ? `${duration[1]}${duration[2]}` : null,
    pace: pace?.[0] || null,
    power: power?.[0] || null,
    cadence: cadence?.[0] || null,
    rpe: rpe?.[0] || null,
    open: /\bopen\b/.test(value),
  };
}

function semanticBuilder(value) {
  if (!value) return null;
  return String(value).trim().split(/\n\s*\n/).map(block => {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const group = !lines[0].startsWith("-") ? lines[0].match(/(\d+)x$/) : null;
    return {
      repetitions: group ? Number(group[1]) : null,
      steps: lines.filter(line => line.startsWith("-")).map(semanticStep),
    };
  });
}

function flattenSteps(builder) {
  return builder.flatMap(block => block.steps.map(step => ({ ...step, repetitions: block.repetitions })));
}

test("wszystkie 80 wydarzeń zachowują semantykę sprzed compact descriptions", () => {
  assert.equal(baseline.count, 80);
  for (const expected of baseline.events) {
    const workout = sourceById.get(expected.external_id);
    const event = payloadById.get(expected.external_id);
    assert.ok(workout, expected.external_id);
    assert.ok(event, expected.external_id);
    assert.equal(workout.date, expected.date, expected.external_id);
    assert.equal(workout.sport, expected.sport, expected.external_id);
    assert.equal(workout.parentId, expected.parentId, expected.external_id);
    assert.equal(workout.alternativeGroup ?? null, expected.alternativeGroup, expected.external_id);
    assert.equal(Boolean(workout.optional), expected.optional, expected.external_id);
    assert.equal(Boolean(workout.required), expected.required, expected.external_id);
    assert.equal(event.external_id, expected.external_id);
    assert.equal(event.start_date_local.slice(0, 10), expected.date, expected.external_id);
    assert.equal(event.type ?? null, expected.type, expected.external_id);
    if (expected.category !== "NOTE") {
      assert.deepEqual(semanticBuilder(event.description), semanticBuilder(expected.structuredWorkoutText), expected.external_id);
    }
  }
});

test("threshold zachowuje prawdziwe 3 × 1 km z recovery", () => {
  const id = "cc-v2-oslo-2026-2026-07-21-run-1";
  const builder = semanticBuilder(payloadById.get(id).description);
  const group = builder.find(block => block.repetitions === 3);
  assert.ok(group, id);
  assert.equal(group.steps.length, 2);
  assert.equal(group.steps[0].duration, "1km");
  assert.equal(group.steps[0].pace, "4:12/km-4:20/km Pace");
  assert.equal(group.steps[1].duration, "2m");
  assert.equal(group.steps[1].pace, "5:40/km-6:20/km Pace");
});

test("podbiegi i rytmy zachowują grupy, powtórzenia i recovery", () => {
  const cases = [
    ["cc-v2-oslo-2026-2026-07-28-run-1", 6, "60s", "150s"],
    ["cc-v2-oslo-2026-2026-07-16-run-1", 6, "20s", "90s"],
  ];
  for (const [id, repetitions, effort, recovery] of cases) {
    const group = semanticBuilder(payloadById.get(id).description).find(block => block.repetitions === repetitions);
    assert.ok(group, id);
    assert.equal(group.steps.length, 2, id);
    assert.equal(group.steps[0].duration, effort, id);
    assert.equal(group.steps[1].duration, recovery, id);
    assert.equal(group.steps[1].open, true, id);
  }
});

test("long z MP zachowuje wszystkie segmenty", () => {
  const steps = flattenSteps(semanticBuilder(payloadById.get("cc-v2-oslo-2026-2026-08-15-run-1").description));
  assert.deepEqual(steps.map(step => [step.duration, step.pace]), [
    ["1km", "5:30/km-6:05/km Pace"],
    ["15km", "5:15/km-5:50/km Pace"],
    ["3km", "4:55/km-5:02/km Pace"],
    ["1km", "5:35/km-6:15/km Pace"],
  ]);
});

test("Ride zachowuje dokładny target FTP, kadencję i czas", () => {
  for (const workout of source.workouts.filter(item => item.sport === "Ride")) {
    const steps = flattenSteps(semanticBuilder(payloadById.get(workout.external_id).description));
    assert.equal(steps.length, 1, workout.external_id);
    assert.equal(steps[0].duration, `${workout.durationMinutes}m`, workout.external_id);
    assert.equal(steps[0].power, "55-70%", workout.external_id);
    assert.equal(steps[0].cadence, "85-95rpm", workout.external_id);
  }
});

test("Strength zachowuje pełny czas i nie jest pustym workoutem", () => {
  for (const workout of source.workouts.filter(item => item.sport === "Strength")) {
    const steps = flattenSteps(semanticBuilder(payloadById.get(workout.external_id).description));
    assert.equal(steps.length, 1, workout.external_id);
    assert.equal(steps[0].duration, `${workout.durationMinutes}m`, workout.external_id);
    const expectedRpe = /mobilność|aktywacja/i.test(`${workout.name} ${workout.mainSet}`) ? "2 RPE" : String(workout.rpe).replace("–", "-") + " RPE";
    assert.equal(steps[0].rpe, expectedRpe, workout.external_id);
  }
});

test("compactDescription nie jest źródłem składni structured workout", () => {
  assert.match(generator, /function structuredWorkoutTextFor\(/);
  assert.match(generator, /return shortTechnicalLabels\(workout\.structuredWorkoutText\)/);
  assert.doesNotMatch(generator, /sport === "Strength"[^\n]*compactDescription/);
  assert.doesNotMatch(generator, /sport === "Ride"[^\n]*compactDescription/);
  for (const workout of source.workouts.filter(item => ["Run", "Ride", "Strength"].includes(item.sport))) {
    assert.notEqual(workout.structuredWorkoutText, workout.compactDescription, workout.external_id);
  }
});

test("regresja: naprawa aktualizuje dokładnie 30 uszkodzonych wydarzeń", () => {
  const desired = payload.filter(item => item.external_id?.startsWith("cc-v2-oslo-2026-") && item.start_date_local.slice(0, 10) >= "2026-07-15" && item.start_date_local.slice(0, 10) <= "2026-09-12");
  const plan = buildSyncPlan(broken, desired);
  assert.deepEqual({ delete: plan.remove.length, update: plan.update.length, add: plan.add.length, unchanged: plan.unchanged.length }, { delete: 0, update: 30, add: 0, unchanged: 50 });
});
