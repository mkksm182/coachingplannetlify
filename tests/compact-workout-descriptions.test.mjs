import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const app = await fs.readFile(path.join(root, "app.js"), "utf8");
const css = await fs.readFile(path.join(root, "style.css"), "utf8");
const payload = JSON.parse(await fs.readFile(path.join(root, "garmin/intervals_payload_structured.json"), "utf8"));
const ics = await fs.readFile(path.join(root, "garmin/plan_intervals_structured_with_notes.ics"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(await fs.readFile(path.join(root, "data/plan.js"), "utf8"), context);
vm.runInContext(await fs.readFile(path.join(root, "data/structured_workouts.js"), "utf8"), context);
const plan = context.window.PLAN_DATA.items.filter(item => item.dateISO >= source.range.start && item.dateISO <= source.range.end);
const structured = context.window.STRUCTURED_WORKOUTS.filter(item => item.dateISO >= source.range.start && item.dateISO <= source.range.end);
const workouts = source.workouts;

function lines(value) {
  return String(value || "").split(/\r?\n/).filter(Boolean);
}

function structuralFingerprint(items) {
  const invariant = items.map(workout => ({
    id: workout.id,
    external_id: workout.external_id,
    parentId: workout.parentId,
    date: workout.date,
    time: workout.time,
    sport: workout.sport,
    workoutType: workout.workoutType,
    distanceKm: workout.distanceKm,
    distanceRangeKm: workout.distanceRangeKm,
    durationMinutes: workout.durationMinutes,
    pace: workout.pace,
    paceDisplay: workout.paceDisplay,
    rpe: workout.rpe,
    optional: workout.optional,
    required: workout.required,
    alternativeGroup: workout.alternativeGroup,
    structuredSteps: (workout.structuredSteps || []).map(({ label, ...step }) => step),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(invariant)).digest("hex");
}

test("każdy workout ma krótkie compactDescription i compactTitle", () => {
  for (const workout of workouts) {
    assert.ok(workout.compactDescription, workout.id);
    assert.ok(workout.compactTitle, workout.id);
    assert.ok(workout.compactTitle.length <= 45, workout.id);
    assert.ok(lines(workout.compactDescription).length <= 6, workout.id);
    assert.doesNotMatch(workout.compactDescription, /cel treningowy|ten trening poprawia|korzyści|strategia|nawodnieni|sen/i, workout.id);
  }
});

test("UI kart i szczegółów używa compactDescription zamiast pełnego starego opisu", () => {
  assert.match(app, /function compactText\(/);
  assert.match(app, /compactHtml\(it,4,true\)/);
  assert.match(app, /compactHtml\(it,6,true\)/);
  assert.doesNotMatch(app, /<b>Cel<\/b>/);
  assert.doesNotMatch(app, /<b>Żywienie<\/b>/);
  assert.match(css, /\.compact-description/);
});

test("easy pokazuje dystans, tempo i RPE", () => {
  const easy = workouts.find(item => item.workoutType === "EASY_STRIDES");
  assert.match(easy.compactDescription, /Easy 7 km/);
  assert.match(easy.compactDescription, /Easy 5 km @ 5:10–5:45\/km/);
  assert.match(easy.compactDescription, /RPE 3–4/);
});

test("threshold pokazuje WU, odcinki, przerwę i CD", () => {
  const threshold = workouts.find(item => item.workoutType === "THRESHOLD");
  assert.match(threshold.compactDescription, /WU: 2 km @ 5:30–6:05\/km/);
  assert.match(threshold.compactDescription, /3 × Próg 1 km @ 4:12–4:20\/km/);
  assert.match(threshold.compactDescription, /Przerwa: 2 min @ 5:40–6:20\/km/);
  assert.match(threshold.compactDescription, /CD: 2 km @ 5:35–6:15\/km/);
});

test("long z MP pokazuje każdy główny segment i krótki Plan B", () => {
  const long = workouts.find(item => item.date === "2026-08-15" && item.workoutType === "LONG_RUN_GATE");
  assert.match(long.compactDescription, /Long easy 15 km @ 5:15–5:50\/km/);
  assert.match(long.compactDescription, /MP 3 km @ 4:55–5:02\/km/);
  assert.match(long.compactDescription, /Plan B: 18 km easy bez MP\./);
});

test("podbiegi i hill sprints nie mają targetu tempa na szybkiej części", () => {
  for (const workout of workouts.filter(item => item.effortBased)) {
    const fast = workout.structuredSteps.filter(step => step.kind === "repeat");
    assert.ok(fast.length, workout.id);
    assert.ok(fast.every(step => step.targetType === "effort" && step.targetPace === null), workout.id);
  }
  const hills = workouts.find(item => item.workoutType === "HILLS");
  assert.match(hills.compactDescription, /nachylenie 4–7%, RPE 7/);
  assert.match(hills.compactDescription, /Bez targetu tempa pod górę\./);
});

test("ALT jasno wymaga wyboru jednej opcji", () => {
  for (const workout of workouts.filter(item => item.alternativeGroup)) {
    assert.match(workout.compactDescription, /^Wybierz jedną opcję:/);
    assert.match(workout.compactDescription, /Nie wykonuj więcej niż jednej\./);
  }
});

test("Strength pozostaje osobną jednostką i ma krótką listę ćwiczeń", () => {
  const strength = workouts.find(item => item.sport === "Strength");
  assert.equal(strength.workoutType, "STRENGTH");
  assert.match(strength.compactDescription, /Siła — \d+ min/);
  assert.match(strength.compactDescription, /Split squat/);
  assert.match(strength.compactDescription, /Wspięcia łydki/);
  assert.ok(lines(strength.compactDescription).length <= 6);
  assert.ok(!workouts.some(item => item.sport === "Run" && item.external_id === strength.external_id));
});

test("każdy widoczny Plan B ma najwyżej jedno krótkie zdanie", () => {
  for (const workout of workouts.filter(item => /Plan B:/.test(item.compactDescription))) {
    const planB = lines(workout.compactDescription).find(line => line.startsWith("Plan B:"));
    assert.equal((planB.match(/[.!?](?:\s|$)/g) || []).length, 1, workout.id);
    assert.ok(planB.length <= 90, workout.id);
  }
});

test("daty, dystanse, tempa, kroki wykonawcze i external_id nie zmieniły się", () => {
  assert.equal(structuralFingerprint(workouts), "6c0abab251f95795dad766263004bc7721a31401e0908552c2d3483b972d9882");
});

test("plan, Intervals JSON, Garmin i ICS korzystają z krótkich opisów", () => {
  assert.equal(plan.length, workouts.length);
  assert.equal(structured.length, workouts.length);
  for (const workout of workouts) {
    assert.equal(plan.find(item => item.id === workout.external_id).compactDescription, workout.compactDescription);
    const event = structured.find(item => item.id === workout.external_id);
    assert.equal(event.description, workout.compactDescription);
    assert.ok(lines(event.intervalsDescription).length <= 6, workout.id);
    const intervalEvent = payload.find(item => item.external_id === workout.external_id);
    assert.equal(intervalEvent.description, event.intervalsDescription);
    assert.match(ics, new RegExp(`UID:${workout.external_id}@coach-center\\.local`));
    assert.doesNotMatch(event.description, /## Coach notes|Fueling:|Cel treningowy/i, workout.id);
  }
});

test("nazwy kroków Garmin są krótkie", () => {
  const allowed = new Set(["Rozgrzewka", "Próg", "Trucht", "MP", "Schłodzenie", "Podbieg", "Powrót", "Easy", "Recovery", "Rytm", "Long easy", "Steady"]);
  for (const workout of workouts.filter(item => item.sport === "Run")) {
    for (const step of workout.structuredSteps) assert.ok(allowed.has(step.label), `${workout.id}: ${step.label}`);
  }
});

test("reguły mobilne zachowują brak poziomego przepełnienia", () => {
  assert.match(css, /\.form-grid>\*\{min-width:0\}/);
  assert.match(css, /overflow-wrap:anywhere/);
});
