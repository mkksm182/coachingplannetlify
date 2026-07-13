#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = "https://intervals.icu/api/v1";
const START = "2026-07-15";
const END = "2026-09-12";
const OLD_PROJECT_PREFIXES = ["opcoach-", "opcoach-safe-"];

function parseArgs(argv) {
  const options = { apply: false, athlete: "0", eventsFile: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") options.apply = true;
    else if (argv[i] === "--athlete") options.athlete = argv[++i];
    else if (argv[i] === "--events-file") options.eventsFile = path.resolve(argv[++i]);
    else if (argv[i] === "--json") options.json = true;
    else throw new Error(`Nieznany argument: ${argv[i]}`);
  }
  if (options.apply && options.eventsFile) throw new Error("--apply nie może być użyte z --events-file.");
  return options;
}

function authHeader() {
  const key = process.env.INTERVALS_API_KEY;
  if (!key) throw new Error("Brak INTERVALS_API_KEY. DRY RUN offline: użyj --events-file <plik.json>.");
  return `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`;
}

async function apiRequest(method, pathname, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { authorization: authHeader(), accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Intervals API ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function eventDate(event) {
  return String(event.start_date_local || event.startDateLocal || event.start_date || event.date || "").slice(0, 10);
}

function externalId(event) {
  return String(event.external_id || event.externalId || "");
}

function isOldProjectEvent(event) {
  const id = externalId(event);
  const date = eventDate(event);
  return date >= START && date <= END && OLD_PROJECT_PREFIXES.some(prefix => id.startsWith(prefix));
}

function comparable(event) {
  return {
    category: event.category || "WORKOUT",
    start_date_local: event.start_date_local,
    name: event.name || "",
    description: event.description || "",
    type: event.category === "NOTE" ? undefined : event.type || "Workout",
    external_id: externalId(event),
  };
}

function equalEvent(left, right) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function buildSyncPlan(existingEvents, desiredEvents) {
  const existing = Array.isArray(existingEvents) ? existingEvents : [];
  const desired = desiredEvents.filter(event => {
    const date = eventDate(event);
    return date >= START && date <= END && externalId(event).startsWith("cc-v2-oslo-2026-");
  });
  const existingByExternal = new Map(existing.filter(event => externalId(event)).map(event => [externalId(event), event]));
  const remove = existing.filter(isOldProjectEvent).map(event => ({ id: event.id, external_id: externalId(event), date: eventDate(event), name: event.name }));
  const update = [];
  const add = [];
  const unchanged = [];
  for (const event of desired) {
    const current = existingByExternal.get(externalId(event));
    if (!current) add.push(event);
    else if (equalEvent(current, event)) unchanged.push(event);
    else update.push({ ...event, id: current.id });
  }
  return { remove, update, add, unchanged };
}

function printList(label, items) {
  console.log(`\n${label} (${items.length})`);
  if (!items.length) console.log("  —");
  for (const item of items) console.log(`  ${eventDate(item) || item.date} | ${externalId(item)} | ${item.name || ""}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const desired = JSON.parse(await fs.readFile(path.join(root, "garmin/intervals_payload_structured.json"), "utf8"));
  const existing = options.eventsFile
    ? JSON.parse(await fs.readFile(options.eventsFile, "utf8"))
    : await apiRequest("GET", `/athlete/${encodeURIComponent(options.athlete)}/events?oldest=${START}&newest=${END}`);
  const plan = buildSyncPlan(existing, desired);
  const summary = { mode: options.apply ? "APPLY" : "DRY RUN", delete: plan.remove.length, update: plan.update.length, add: plan.add.length, unchanged: plan.unchanged.length };

  if (options.json) console.log(JSON.stringify(summary));
  else {
    console.log(`${summary.mode}: Oslo V2 ${START}–${END}`);
    printList("USUNIĘCIE starych wydarzeń projektu", plan.remove);
    printList("AKTUALIZACJA cc-v2", plan.update);
    printList("DODANIE cc-v2", plan.add);
    console.log(`\nBez zmian: ${plan.unchanged.length}`);
  }

  if (!options.apply) {
    if (!options.json) console.log("\nIntervals.icu nie zostało zmienione. Aby wykonać operację, uruchom ponownie z --apply i INTERVALS_API_KEY.");
    return;
  }

  if (!process.env.INTERVALS_API_KEY) throw new Error("--apply wymaga INTERVALS_API_KEY.");
  const deletionPayload = plan.remove.map(event => event.id != null ? { id: event.id } : { external_id: event.external_id });
  if (deletionPayload.length) await apiRequest("PUT", `/athlete/${encodeURIComponent(options.athlete)}/events/bulk-delete`, deletionPayload);
  const upserts = [...plan.update, ...plan.add].map(({ id, ...event }) => event);
  if (upserts.length) await apiRequest("POST", `/athlete/${encodeURIComponent(options.athlete)}/events/bulk?upsert=true`, upserts);
  console.log(`APPLY zakończone: usunięto ${plan.remove.length}, zaktualizowano ${plan.update.length}, dodano ${plan.add.length}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

export { START, END, isOldProjectEvent };
