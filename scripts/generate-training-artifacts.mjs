import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const RANGE_START = "2026-07-15";
const RANGE_END = "2026-09-12";
const MANUAL_FIELDS = [
  "RPE 1-10", "Ból 0-10", "Sen (h)", "Paliwo / żele", "Uwagi / status",
  "Buty / sprzęt", "Plan wykonany %", "Mental 1-10", "Coach flag", "Plan B / decyzja",
];
const GENERATED_FILES = [
  "data/plan.js",
  "data/structured_workouts.js",
  "garmin/intervals_payload.json",
  "garmin/intervals_payload_structured.json",
  "garmin/plan_google.ics",
  "garmin/plan_intervals.ics",
  "garmin/plan_intervals_structured.ics",
  "garmin/plan_intervals_structured_with_notes.ics",
];

function inRange(item) {
  return item?.dateISO >= RANGE_START && item?.dateISO <= RANGE_END;
}

async function loadWindowValue(file, key) {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(file, "utf8"), context, { filename: file });
  return JSON.parse(JSON.stringify(context.window[key]));
}

function excelSerial(date) {
  return String(Math.floor((new Date(`${date}T00:00:00Z`) - new Date("1899-12-30T00:00:00Z")) / 86400000));
}

function monthLabel(date) {
  const names = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
  return `${names[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

function buildPlanItems(source, oldItems) {
  const previousById = new Map(oldItems.filter(inRange).map(item => [String(item.id), item]));
  const previousByParent = new Map(oldItems.filter(inRange).map(item => [String(item.parentId || item.id), item]));
  const previousByDate = new Map(oldItems.filter(inRange).map(item => [item.dateISO, item]));
  const replacements = source.workouts.map(workout => {
    const dateISO = workout.date;
    const previous = previousById.get(workout.external_id) || previousByParent.get(workout.parentId) || previousByDate.get(dateISO) || {};
    const distance = workout.distanceRangeKm ? `${workout.distanceRangeKm[0]}–${workout.distanceRangeKm[1]}` : workout.distanceKm ?? "";
    const plannedKm = workout.optional ? "" : workout.distanceRangeKm ? workout.distanceRangeKm.join("-") : workout.distanceKm ?? "";
    const plannedMinutes = workout.optional ? "" : workout.durationMinutes ?? "";
    const status = workout.optional ? "[OPCJONALNE/ALT] " : workout.required ? "" : "[INFORMACJA] ";
    const description = `${status}${[workout.warmup, workout.mainSet, workout.recovery, workout.cooldown].filter(Boolean).join(" | ")}${workout.paceDisplay ? `\nTempo i RPE: ${workout.paceDisplay}` : ""}`;
    const item = {
      Data: excelSerial(dateISO),
      Dzień: workout.dayName,
      "Faza / tydzień": workout.week,
      "Priorytet tygodnia": workout.priority,
      Dyscyplina: workout.name,
      "Szczegółowy opis treningu": description,
      Intensywność: workout.intensity,
      "Cel jednostki": workout.goal,
      Śniadanie: workout.fuel,
      Obiad: "Po treningu: pełnowartościowy posiłek, białko, węglowodany i płyny.",
      "Kolacja / po treningu": workout.fuel,
      "Modyfikacja jeśli zmęczenie/ból": workout.planB,
      Miesiąc: dateISO.endsWith("-01") ? monthLabel(dateISO).toUpperCase() : "",
      Kolor: "■",
      Typ: workout.workoutType,
      Charakterystyka: workout.conditions || workout.goal,
      "Czas min": plannedMinutes,
      "Dystans km": workout.optional ? "" : distance,
      Phase: workout.phase,
      dateISO,
      id: workout.external_id,
      external_id: workout.external_id,
      parentId: workout.parentId,
      week: workout.week,
      discipline: workout.name,
      sport: workout.sport,
      description,
      intensity: workout.intensity,
      goal: workout.goal,
      breakfast: workout.fuel,
      lunch: "Po treningu: pełnowartościowy posiłek, białko, węglowodany i płyny.",
      dinner: workout.fuel,
      modification: [workout.planB, workout.conditions].filter(Boolean).join(" | "),
      plannedMinutes,
      plannedKm,
      pace: workout.pace,
      paceDisplay: workout.paceDisplay,
      paceSummary: workout.paceSummary,
      rpe: workout.rpe,
      effortBased: Boolean(workout.effortBased),
      optional: Boolean(workout.optional),
      required: Boolean(workout.required),
      alternativeGroup: workout.alternativeGroup,
      monthLabel: monthLabel(dateISO),
      dayNum: Number(dateISO.slice(8, 10)),
      monthKey: dateISO.slice(0, 7),
      sourceVersion: "oslo-v2",
      parts: [workout.external_id],
    };
    for (const field of MANUAL_FIELDS) item[field] = previous[field] ?? "";
    return item;
  });
  return [...oldItems.filter(item => !inRange(item)), ...replacements].sort((a, b) => a.dateISO.localeCompare(b.dateISO) || String(a.id).localeCompare(String(b.id)));
}

function formatDescription(workout) {
  const sections = [
    `# ${workout.name}`,
    `Data: ${workout.date}`,
    `Faza: ${workout.phase}`,
    `Tydzień: ${workout.week}`,
    `Intensywność: ${workout.intensity}`,
    `Status: ${workout.optional ? "OPCJONALNE / ALT" : workout.required ? "OBOWIĄZKOWE" : "INFORMACJA"}`,
    "",
    "## Coach notes",
    [workout.warmup, workout.mainSet, workout.recovery, workout.cooldown].filter(Boolean).join(" | "),
    workout.paceDisplay ? `Tempo i RPE: ${workout.paceDisplay}` : "",
    workout.conditions ? `Warunki: ${workout.conditions}` : "",
    `Plan B: ${workout.planB}`,
    `Fueling: ${workout.fuel}`,
    "",
    "---",
    "",
    workout.structuredWorkoutText,
  ];
  return sections.filter((line, index) => line !== "" || sections[index - 1] !== "").join("\n").trim();
}

function sportType(sport) {
  return { Run: "Run", Ride: "Ride", Strength: "WeightTraining", Note: "NOTE" }[sport] || "Workout";
}

function buildStructured(source, oldStructured) {
  const replacements = source.workouts.map(workout => ({
    id: workout.external_id,
    external_id: workout.external_id,
    parentId: workout.parentId,
    dateISO: workout.date,
    time: workout.time,
    title: workout.name,
    type: sportType(workout.sport),
    sport: workout.sport,
    category: workout.sport === "Note" ? "NOTE" : "WORKOUT",
    optional: workout.optional,
    required: workout.required,
    alternativeGroup: workout.alternativeGroup,
    countsTowardMileage: workout.countsTowardMileage,
    plannedKm: workout.optional ? "" : workout.distanceRangeKm ? workout.distanceRangeKm.join("-") : workout.distanceKm ?? "",
    plannedMinutes: workout.durationMinutes ?? "",
    intensity: workout.intensity,
    pace: workout.pace,
    paceDisplay: workout.paceDisplay,
    paceSummary: workout.paceSummary,
    rpe: workout.rpe,
    effortBased: Boolean(workout.effortBased),
    goalPaceConditional: Boolean(workout.goalPaceConditional),
    structuredSteps: workout.structuredSteps || [],
    elevationM: workout.elevationM,
    conditions: workout.conditions,
    planB: workout.planB,
    builderText: workout.structuredWorkoutText,
    description: formatDescription(workout),
    sourceDiscipline: workout.name,
    sourceDescription: workout.mainSet,
    sourceVersion: "oslo-v2",
    quality: workout.quality,
    mechanicalLoad: workout.mechanicalLoad,
  }));
  return [...oldStructured.filter(item => !inRange(item)), ...replacements].sort((a, b) => a.dateISO.localeCompare(b.dateISO) || (a.time || "").localeCompare(b.time || "") || a.id.localeCompare(b.id));
}

function payloadFromStructured(structured) {
  return structured.map(event => {
    const item = {
      category: event.category || "WORKOUT",
      start_date_local: `${event.dateISO}T${event.time || "08:00"}:00`,
      name: event.title || "Trening",
      description: event.description || "",
      external_id: event.external_id || event.id,
    };
    if (item.category !== "NOTE") item.type = event.type || "Workout";
    return item;
  });
}

function icsEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldIcsLine(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 73) return line;
  const pieces = [];
  let current = "";
  for (const char of line) {
    const next = current + char;
    if (Buffer.byteLength(next, "utf8") > 73) {
      const trailingSpaces = current.match(/ +$/)?.[0] || "";
      pieces.push(trailingSpaces ? current.slice(0, -trailingSpaces.length) : current);
      current = ` ${trailingSpaces}${char}`;
    } else current = next;
  }
  pieces.push(current);
  return pieces.join("\r\n");
}

function addMinutes(dateISO, time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(`${dateISO}T${time}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + (minutes || 60));
  return `${dateISO.replaceAll("-", "")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}00`;
}

function makeIcsEvents(structured, includeNotes = true) {
  return structured.filter(event => includeNotes || event.category !== "NOTE").map(event => {
    const start = `${event.dateISO.replaceAll("-", "")}T${(event.time || "08:00").replace(":", "")}00`;
    const duration = Number(event.plannedMinutes) || (event.type === "Run" ? 75 : event.type === "Ride" ? 60 : 30);
    const lines = [
      "BEGIN:VEVENT",
      `UID:${event.id}@coach-center.local`,
      "DTSTAMP:20260714T000000Z",
      `DTSTART;TZID=Europe/Oslo:${start}`,
      `DTEND;TZID=Europe/Oslo:${addMinutes(event.dateISO, event.time || "08:00", duration)}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `CATEGORIES:${icsEscape(event.type)}`,
      `DESCRIPTION:${icsEscape(event.description)}`,
      "END:VEVENT",
    ];
    return lines.map(foldIcsLine).join("\r\n");
  }).join("\r\n");
}

function replaceIcsWindow(existing, replacements, includeNotes = true) {
  const newEvents = makeIcsEvents(replacements.filter(inRange), includeNotes);
  let inserted = false;
  const eventPattern = /BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT(?:\r?\n)?/g;
  const result = existing.replace(eventPattern, block => {
    const match = block.match(/DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})T/);
    const date = match ? `${match[1]}-${match[2]}-${match[3]}` : "";
    if (date < RANGE_START || date > RANGE_END) return block;
    if (inserted) return "";
    inserted = true;
    return `${newEvents}\r\n`;
  });
  if (inserted) return result;
  return result.replace(/END:VCALENDAR/, `${newEvents}\r\nEND:VCALENDAR`);
}

async function writeText(root, relative, text) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

export async function generateArtifacts({ outputRoot = REPO_ROOT, baselineRoot = REPO_ROOT } = {}) {
  const source = JSON.parse(await fs.readFile(path.join(baselineRoot, "data/oslo-marathon-2026-v2.json"), "utf8"));
  const oldPlan = await loadWindowValue(path.join(baselineRoot, "data/plan.js"), "PLAN_DATA");
  const oldStructured = await loadWindowValue(path.join(baselineRoot, "data/structured_workouts.js"), "STRUCTURED_WORKOUTS");
  const oldIcs = Object.fromEntries(await Promise.all(GENERATED_FILES.filter(file => file.endsWith(".ics")).map(async file => [
    file,
    await fs.readFile(path.join(baselineRoot, file), "utf8"),
  ])));
  const planItems = buildPlanItems(source, oldPlan.items);
  const structured = buildStructured(source, oldStructured);
  const plan = {
    stats: { ...oldPlan.stats, generated: source.generatedAt, count: planItems.length, source: "data/oslo-marathon-2026-v2.json" },
    items: planItems,
  };
  const payload = payloadFromStructured(structured);

  await writeText(outputRoot, "data/plan.js", `window.PLAN_DATA = ${JSON.stringify(plan)};\n`);
  await writeText(outputRoot, "data/structured_workouts.js", `window.STRUCTURED_WORKOUTS = ${JSON.stringify(structured, null, 2)};\n`);
  await writeText(outputRoot, "garmin/intervals_payload.json", `${JSON.stringify(payload, null, 2)}\n`);
  await writeText(outputRoot, "garmin/intervals_payload_structured.json", `${JSON.stringify(payload, null, 2)}\n`);
  await writeText(outputRoot, "garmin/plan_google.ics", replaceIcsWindow(oldIcs["garmin/plan_google.ics"], structured, true));
  await writeText(outputRoot, "garmin/plan_intervals.ics", replaceIcsWindow(oldIcs["garmin/plan_intervals.ics"], structured, true));
  await writeText(outputRoot, "garmin/plan_intervals_structured.ics", replaceIcsWindow(oldIcs["garmin/plan_intervals_structured.ics"], structured, false));
  await writeText(outputRoot, "garmin/plan_intervals_structured_with_notes.ics", replaceIcsWindow(oldIcs["garmin/plan_intervals_structured_with_notes.ics"], structured, true));
  return { planItems: planItems.length, structuredWorkouts: structured.length, generatedFiles: GENERATED_FILES };
}

function parseArgs(argv) {
  const args = { outputRoot: REPO_ROOT, baselineRoot: REPO_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--output-root") args.outputRoot = path.resolve(argv[++i]);
    else if (argv[i] === "--baseline-root") args.baselineRoot = path.resolve(argv[++i]);
    else throw new Error(`Nieznany argument: ${argv[i]}`);
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateArtifacts(parseArgs(process.argv.slice(2)));
  console.log(`Generated ${result.generatedFiles.length} files (${result.planItems} plan days, ${result.structuredWorkouts} structured events).`);
}

export { GENERATED_FILES, RANGE_START, RANGE_END };
