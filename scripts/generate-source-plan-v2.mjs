import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data/oslo-marathon-2026-v2.json"), "utf8"));
const output = path.join(root, "source_plan_v2.xlsx");
const previewDir = path.join(root, "work/source-plan-v2-preview");

async function filesBelow(directory, current = "") {
  const entries = await fs.readdir(path.join(directory, current), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(directory, relative));
    else files.push(relative);
  }
  return files.sort();
}

function stableRelationshipId(target) {
  const name = String(target).split("/").pop().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-");
  return `R-${name}`;
}

async function normalizeXlsx(filePath) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "oslo-v2-xlsx-"));
  try {
    execFileSync("unzip", ["-qq", filePath, "-d", directory]);
    const relationshipFiles = ["_rels/.rels", "xl/_rels/workbook.xml.rels"];
    for (const relative of relationshipFiles) {
      const absolute = path.join(directory, relative);
      const xml = await fs.readFile(absolute, "utf8");
      const normalized = xml.replace(/(<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId=")[^"]+("\s*\/>)/g,
        (match, before, target, after) => `${before}${stableRelationshipId(target)}${after}`);
      await fs.writeFile(absolute, normalized);
    }
    const workbookPath = path.join(directory, "xl/workbook.xml");
    const workbookXml = await fs.readFile(workbookPath, "utf8");
    await fs.writeFile(workbookPath, workbookXml.replace(/(<x:sheet\b[^>]*\bsheetId="(\d+)"[^>]*\br:id=")[^"]+(")/g,
      (match, before, sheetId, after) => `${before}R-sheet${sheetId}${after}`));

    const files = await filesBelow(directory);
    const fixedTime = new Date("2000-01-01T00:00:00Z");
    for (const relative of files) await fs.utimes(path.join(directory, relative), fixedTime, fixedTime);
    const normalizedPath = path.join(os.tmpdir(), `source-plan-v2-${process.pid}.xlsx`);
    await fs.rm(normalizedPath, { force: true });
    execFileSync("zip", ["-X", "-q", normalizedPath, ...files], { cwd: directory });
    await fs.copyFile(normalizedPath, filePath);
    await fs.rm(normalizedPath, { force: true });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const workbook = Workbook.create();
const plan = workbook.worksheets.add("FAZA 1 - OSLO V2");
const weeks = workbook.worksheets.add("TYGODNIE I BRAMKI");
const strategy = workbook.worksheets.add("STRATEGIA STARTOWA");
for (const sheet of [plan, weeks, strategy]) sheet.showGridLines = false;

const headers = [
  "Data", "Dzień", "Tydzień", "Status", "Sport", "Trening", "Typ", "Km min", "Km max",
  "Czas min", "Intensywność", "Tempo — skrót", "Tempo i RPE — wszystkie bloki", "RPE", "Przewyższenie m",
  "Część główna", "Plan B", "Warunki", "Paliwo", "parentId", "external_id", "Structured workout", "Long",
  "compactDescription",
];
plan.getRange(`A1:X${source.workouts.length + 1}`).values = [
  headers,
  ...source.workouts.map(item => [
    new Date(`${item.date}T12:00:00Z`), item.dayName, item.week,
    item.optional ? "OPCJONALNE / ALT" : item.required ? "OBOWIĄZKOWE" : "INFORMACJA",
    item.sport, item.compactTitle, item.workoutType,
    item.distanceRangeKm?.[0] ?? item.distanceKm ?? null,
    item.distanceRangeKm?.[1] ?? item.distanceKm ?? null,
    item.durationMinutes, item.intensity, item.paceSummary || item.pace, item.paceDisplay, item.rpe, item.elevationM,
    item.mainSet, item.planB, item.conditions, item.fuel, item.parentId, item.external_id, item.structuredWorkoutText, item.workoutType.startsWith("LONG") ? 1 : 0,
    item.compactDescription,
  ]),
];
plan.getRange("A1:X1").format = { fill: "#12304A", font: { bold: true, color: "#FFFFFF" }, wrapText: true };
plan.getRange(`A2:A${source.workouts.length + 1}`).format.numberFormat = "yyyy-mm-dd";
plan.getRange(`H2:J${source.workouts.length + 1}`).format.numberFormat = "0.0";
plan.getRange(`O2:O${source.workouts.length + 1}`).format.numberFormat = "0";
plan.getRange(`A1:X${source.workouts.length + 1}`).format.borders = { preset: "inside", style: "thin", color: "#D9E2EA" };
plan.getRange(`A2:X${source.workouts.length + 1}`).format.verticalAlignment = "top";
plan.getRange(`M2:S${source.workouts.length + 1}`).format.wrapText = true;
plan.getRange(`V2:V${source.workouts.length + 1}`).format.wrapText = true;
plan.getRange(`A2:X${source.workouts.length + 1}`).conditionalFormats.add("containsText", { text: "OPCJONALNE / ALT", format: { fill: "#FFF3CD", font: { color: "#664D03" } } });
plan.getRange(`A2:X${source.workouts.length + 1}`).conditionalFormats.add("containsText", { text: "BRAMKA", format: { fill: "#FCE8E6", font: { bold: true, color: "#A61B1B" } } });
plan.freezePanes.freezeRows(1);
plan.getRange("A:A").format.columnWidth = 12;
plan.getRange("B:B").format.columnWidth = 13;
plan.getRange("C:C").format.columnWidth = 22;
plan.getRange("D:G").format.columnWidth = 18;
plan.getRange("H:L").format.columnWidth = 14;
plan.getRange("M:M").format.columnWidth = 70;
plan.getRange("N:O").format.columnWidth = 13;
plan.getRange("P:S").format.columnWidth = 42;
plan.getRange("T:U").format.columnWidth = 38;
plan.getRange("V:V").format.columnWidth = 55;
plan.getRange("W:W").format.columnWidth = 10;
plan.getRange("X:X").format.columnWidth = 55;
plan.getRange(`X2:X${source.workouts.length + 1}`).format.wrapText = true;

const weekStarts = ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
weeks.getRange("A1:H1").merge();
weeks.getRange("A1").values = [["OSLO 2026 — tygodnie, kilometraż i bramki"]];
weeks.getRange("A1:H1").format = { fill: "#12304A", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center" };
weeks.getRange("A3:H3").values = [["Tydzień od", "Do", "Biegi obowiązkowe", "Km min", "Km max", "Long min", "Long max", "Kontrola"]];
weeks.getRange("A3:H3").format = { fill: "#2F607D", font: { bold: true, color: "#FFFFFF" } };
weeks.getRange(`A4:B${3 + weekStarts.length}`).values = weekStarts.map(start => {
  const from = new Date(`${start}T12:00:00Z`);
  const to = new Date(from); to.setUTCDate(to.getUTCDate() + 6);
  return [from, to];
});
for (let row = 4; row < 4 + weekStarts.length; row += 1) {
  weeks.getRange(`C${row}`).formulas = [[`=COUNTIFS('FAZA 1 - OSLO V2'!$A$2:$A$81,">="&A${row},'FAZA 1 - OSLO V2'!$A$2:$A$81,"<="&B${row},'FAZA 1 - OSLO V2'!$D$2:$D$81,"OBOWIĄZKOWE",'FAZA 1 - OSLO V2'!$E$2:$E$81,"Run")`]];
  weeks.getRange(`D${row}`).formulas = [[`=SUMIFS('FAZA 1 - OSLO V2'!$H$2:$H$81,'FAZA 1 - OSLO V2'!$A$2:$A$81,">="&A${row},'FAZA 1 - OSLO V2'!$A$2:$A$81,"<="&B${row},'FAZA 1 - OSLO V2'!$D$2:$D$81,"OBOWIĄZKOWE",'FAZA 1 - OSLO V2'!$E$2:$E$81,"Run")`]];
  weeks.getRange(`E${row}`).formulas = [[`=SUMIFS('FAZA 1 - OSLO V2'!$I$2:$I$81,'FAZA 1 - OSLO V2'!$A$2:$A$81,">="&A${row},'FAZA 1 - OSLO V2'!$A$2:$A$81,"<="&B${row},'FAZA 1 - OSLO V2'!$D$2:$D$81,"OBOWIĄZKOWE",'FAZA 1 - OSLO V2'!$E$2:$E$81,"Run")`]];
  weeks.getRange(`F${row}`).formulas = [[`=SUMIFS('FAZA 1 - OSLO V2'!$H$2:$H$81,'FAZA 1 - OSLO V2'!$A$2:$A$81,">="&A${row},'FAZA 1 - OSLO V2'!$A$2:$A$81,"<="&B${row},'FAZA 1 - OSLO V2'!$W$2:$W$81,1)`]];
  weeks.getRange(`G${row}`).formulas = [[`=SUMIFS('FAZA 1 - OSLO V2'!$I$2:$I$81,'FAZA 1 - OSLO V2'!$A$2:$A$81,">="&A${row},'FAZA 1 - OSLO V2'!$A$2:$A$81,"<="&B${row},'FAZA 1 - OSLO V2'!$W$2:$W$81,1)`]];
  weeks.getRange(`H${row}`).values = [[weekStarts[row - 4] === "2026-08-10" ? "15.08: ból 0–2, RPE ≤4, brak pogorszenia" : weekStarts[row - 4] === "2026-08-17" ? "22.08 zależne od 15.08" : weekStarts[row - 4] === "2026-08-31" ? "01.09 test; 02.09 decyzja A/B/C" : "—"]];
}
weeks.getRange(`A4:B${3 + weekStarts.length}`).format.numberFormat = "yyyy-mm-dd";
weeks.getRange(`C4:G${3 + weekStarts.length}`).format.numberFormat = "0.0";
weeks.getRange(`A3:H${3 + weekStarts.length}`).format.borders = { preset: "all", style: "thin", color: "#D9E2EA" };
weeks.getRange(`H4:H${3 + weekStarts.length}`).format.wrapText = true;
weeks.getRange("A:B").format.columnWidth = 14;
weeks.getRange("C:G").format.columnWidth = 18;
weeks.getRange("H:H").format.columnWidth = 45;

strategy.getRange("A1:D1").merge();
strategy.getRange("A1").values = [["STRATEGIA STARTOWA — decyzja 02.09.2026"]];
strategy.getRange("A1:D1").format = { fill: "#12304A", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center" };
strategy.getRange("A3:D3").values = [["Wariant", "Cel", "Tempo", "Warunek"]];
strategy.getRange("A3:D3").format = { fill: "#2F607D", font: { bold: true, color: "#FFFFFF" } };
strategy.getRange("A4:D6").values = source.raceStrategies.map(item => [item.code, item.target, item.pace, item.condition]);
strategy.getRange("A8:D8").merge();
strategy.getRange("A8").values = [["Plan A 3:30 pozostaje wyłącznie po zaliczeniu wszystkich bramek: 15.08, 22.08 i 01.09. Ostateczna decyzja: 02.09."]];
strategy.getRange("A8:D8").format = { fill: "#FCE8E6", font: { bold: true, color: "#A61B1B" }, wrapText: true };
strategy.getRange("A3:D6").format.borders = { preset: "all", style: "thin", color: "#D9E2EA" };
strategy.getRange("A:A").format.columnWidth = 12;
strategy.getRange("B:C").format.columnWidth = 18;
strategy.getRange("D:D").format.columnWidth = 70;

await fs.mkdir(previewDir, { recursive: true });
for (const sheet of [plan, weeks, strategy]) {
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheet.name.replace(/[^a-z0-9_-]+/gi, "-")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const check = await workbook.inspect({ kind: "table", range: "TYGODNIE I BRAMKI!A1:H12", include: "values,formulas", tableMaxRows: 15, tableMaxCols: 10 });
console.log(check.ndjson);
const compactCheck = await workbook.inspect({ kind: "table", range: "FAZA 1 - OSLO V2!U1:X8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 4 });
console.log(compactCheck.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
const blob = await SpreadsheetFile.exportXlsx(workbook);
await blob.save(output);
await normalizeXlsx(output);
console.log(`Saved ${output}`);
