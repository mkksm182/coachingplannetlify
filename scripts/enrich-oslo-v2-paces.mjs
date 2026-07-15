import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "data/oslo-marathon-2026-v2.json");

const PACE = {
  recovery: "5:40–6:20/km",
  easy: "5:10–5:45/km",
  longEasy: "5:15–5:50/km",
  mediumEasy: "5:05–5:35/km",
  steady: "4:40–4:55/km",
  goalMarathon: "4:55–5:02/km",
  threshold: "4:12–4:20/km",
  tenK: "3:58–4:05/km",
  vo2: "3:45–3:55/km",
  warmup: "5:30–6:05/km",
  cooldown: "5:35–6:15/km",
};

const flatNote = "Zakresy tempa dotyczą płaskiego lub łagodnie pofałdowanego terenu. Na pagórkach, w upale i przy wietrze RPE ma pierwszeństwo przed tempem.";
const uphillNote = "Podbieg wykonywany na wysiłek — nie kontroluj tempa chwilowego.";
const recoverySafetyNote = "Przy zmęczeniu nie przyspieszaj: pozostań w zakresie, a RPE ma pierwszeństwo.";

function paceTarget(display) {
  const match = String(display).match(/(\d:\d{2})–(\d:\d{2})\/km/);
  return match ? `${match[1]}/km-${match[2]}/km Pace` : "Z1-Z2 Pace";
}

function distanceOf(workout, fallback = 0) {
  return Number(workout.distanceKm || workout.distanceRangeKm?.[0] || fallback);
}

function step(kind, label, options = {}) {
  return { kind, label, sport: "Run", ...options };
}

function continuousProfile(workout, mainPace, mainRpe, mainLabel = "Część główna") {
  const total = distanceOf(workout);
  const mainKm = Math.max(1, total - 2);
  const steps = [
    step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
    step("main", mainLabel, { distanceKm: mainKm, targetType: "pace", targetPace: mainPace, rpe: mainRpe, flatOnly: true }),
    step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
  ];
  return {
    paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3. Część główna — ${mainLabel}: ${mainKm} km ${mainPace}, RPE ${mainRpe}. Przerwy: nie dotyczy. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
    structuredSteps: steps,
    structuredWorkoutText: [
      `- Warmup 1km ${paceTarget(PACE.warmup)}`,
      `- ${mainLabel} ${mainKm}km ${paceTarget(mainPace)}`,
      `- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
    ].join("\n"),
  };
}

function recoveryProfile(workout) {
  const profile = continuousProfile(workout, PACE.recovery, "2–3", "Recovery");
  profile.paceDisplay = `${profile.paceDisplay} ${recoverySafetyNote}`;
  return profile;
}

function thresholdProfile(workout) {
  const repetitions = workout.date === "2026-08-18" ? 3 : workout.date === "2026-08-04" ? 4 : 3;
  const repKm = workout.date === "2026-08-18" ? 2 : 1;
  const warmKm = workout.date === "2026-08-18" ? 1.5 : 2;
  const coolKm = workout.date === "2026-08-18" ? 1.5 : 2;
  const recoveryMinutes = workout.date === "2026-08-18" ? 3 : 2;
  return {
    paceDisplay: `Rozgrzewka: ${warmKm} km ${PACE.warmup}, RPE 2–3. Część główna: ${repetitions} × ${repKm} km ${PACE.threshold}, RPE 7, na płaskim. Przerwy: ${recoveryMinutes} min truchtu ${PACE.recovery}, RPE 2–3. Schłodzenie: ${coolKm} km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: warmKm, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("repeat", "Threshold", { repetitions, distanceKm: repKm, targetType: "pace", targetPace: PACE.threshold, rpe: "7", flatOnly: true }),
      step("recovery", "Trucht", { repetitions, durationMinutes: recoveryMinutes, targetType: "pace", targetPace: PACE.recovery, rpe: "2–3", flatOnly: true }),
      step("cooldown", "Schłodzenie", { distanceKm: coolKm, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: [
      `- Warmup ${warmKm}km ${paceTarget(PACE.warmup)}`,
      "",
      `Threshold ${repetitions}x`,
      `- Threshold ${repKm}km ${paceTarget(PACE.threshold)}`,
      `- Recovery ${recoveryMinutes}m ${paceTarget(PACE.recovery)}`,
      "",
      `- Cooldown ${coolKm}km ${paceTarget(PACE.cooldown)}`,
    ].join("\n"),
  };
}

function hillsProfile(workout) {
  const longHills = workout.date === "2026-08-11";
  const repetitions = longHills ? 4 : 6;
  const uphillSeconds = longHills ? 180 : 60;
  const recoverySeconds = longHills ? 180 : 150;
  const warmKm = longHills ? 2.5 : 2.5;
  const coolKm = 2;
  return {
    effortBased: true,
    paceDisplay: `Rozgrzewka: ${warmKm} km ${PACE.warmup}, RPE 2–3. Część główna: ${repetitions} × ${uphillSeconds < 120 ? `${uphillSeconds} s` : `${uphillSeconds / 60} min`} pod górę, nachylenie 4–7%, RPE 7; bez targetu tempa. Przerwy: pełny trucht w dół ${recoverySeconds / 60} min, target otwarty, RPE 2–3. Schłodzenie: ${coolKm} km ${PACE.cooldown}, RPE 2–3. ${uphillNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: warmKm, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("repeat", "Podbieg", { repetitions, durationSeconds: uphillSeconds, targetType: "effort", targetPace: null, rpe: "7", grade: "4–7%", effortBased: true }),
      step("recovery", "Trucht w dół", { repetitions, durationSeconds: recoverySeconds, targetType: "open", targetPace: null, rpe: "2–3" }),
      step("cooldown", "Schłodzenie", { distanceKm: coolKm, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: [
      `- Warmup ${warmKm}km ${paceTarget(PACE.warmup)}`,
      "",
      `Uphill effort ${repetitions}x`,
      `- Uphill ${uphillSeconds}s 7 RPE`,
      `- Full jog-down recovery ${recoverySeconds}s open`,
      "",
      `- Cooldown ${coolKm}km ${paceTarget(PACE.cooldown)}`,
    ].join("\n"),
  };
}

function stridesProfile(workout) {
  const total = distanceOf(workout);
  const match = workout.mainSet.match(/(\d+)\s*×\s*(\d+)\s*s/);
  const repetitions = Number(match?.[1] || 4);
  const seconds = Number(match?.[2] || 15);
  const easyKm = Math.max(1, total - 2);
  return {
    effortBased: true,
    paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3. Część główna: ${easyKm} km easy ${PACE.easy}, RPE 3–4 + ${repetitions} × ${seconds} s rytmu technicznego, RPE 7–8, bez targetu tempa. Przerwy: 90 s pełnego truchtu lub marszu, target otwarty. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. Rytmy wykonuj luźno i technicznie; Garmin bez alarmu tempa. ${flatNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Easy", { distanceKm: easyKm, targetType: "pace", targetPace: PACE.easy, rpe: "3–4", flatOnly: true }),
      step("repeat", "Rytm techniczny", { repetitions, durationSeconds: seconds, targetType: "effort", targetPace: null, rpe: "7–8", effortBased: true }),
      step("recovery", "Pełny trucht lub marsz", { repetitions, durationSeconds: 90, targetType: "open", targetPace: null, rpe: "1–2" }),
      step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: [
      `- Warmup 1km ${paceTarget(PACE.warmup)}`,
      `- Easy ${easyKm}km ${paceTarget(PACE.easy)}`,
      "",
      `Strides ${repetitions}x`,
      `- Fast relaxed ${seconds}s 7-8 RPE`,
      "- Full recovery 90s open",
      "",
      `- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
    ].join("\n"),
  };
}

function mediumLongProfile(workout) {
  if (/hill sprints/i.test(workout.name)) {
    const base = stridesProfile({ ...workout, mainSet: workout.mainSet.replace(/sprężystego podbiegu|sprężyście pod górę/i, "rytmu") });
    const match = workout.mainSet.match(/(\d+)\s*×\s*(\d+)\s*s/);
    const repetitions = Number(match?.[1] || 6);
    const seconds = Number(match?.[2] || 10);
    const total = distanceOf(workout);
    const easyKm = Math.max(1, total - 3);
    base.paceDisplay = `Rozgrzewka: 2 km ${PACE.warmup}, RPE 2–3. Część główna: ${easyKm} km średnio-długiego easy ${PACE.mediumEasy}, RPE 3–4 + ${repetitions} × ${seconds} s hill sprint techniczny, nachylenie 4–6%, RPE 8, bez targetu tempa. Przerwy: 2 min pełnego marszu/truchtu w dół, target otwarty. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${uphillNote} Garmin bez alarmu tempa na hill sprintach.`;
    base.structuredSteps = [
      step("warmup", "Rozgrzewka", { distanceKm: 2, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Średnio-długi easy", { distanceKm: easyKm, targetType: "pace", targetPace: PACE.mediumEasy, rpe: "3–4", flatOnly: true }),
      step("repeat", "Hill sprint techniczny", { repetitions, durationSeconds: seconds, targetType: "effort", targetPace: null, rpe: "8", grade: "4–6%", effortBased: true }),
      step("recovery", "Pełny marsz/trucht w dół", { repetitions, durationSeconds: 120, targetType: "open", targetPace: null, rpe: "1–2" }),
      step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ];
    base.structuredWorkoutText = [
      `- Warmup 2km ${paceTarget(PACE.warmup)}`,
      `- Medium long easy ${easyKm}km ${paceTarget(PACE.mediumEasy)}`,
      "",
      `Hill sprints ${repetitions}x`,
      `- Uphill fast relaxed ${seconds}s 8 RPE`,
      "- Full walk-jog recovery 2m open",
      "",
      `- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
    ].join("\n");
    return base;
  }
  if (/steady/i.test(workout.name)) {
    return {
      paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3. Część główna: 6 km średnio-długiego easy ${PACE.mediumEasy}, RPE 3–4 + 3 km steady ${PACE.steady}, RPE 5–6. Przerwy: nie dotyczy. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
      structuredSteps: [
        step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
        step("main", "Średnio-długi easy", { distanceKm: 6, targetType: "pace", targetPace: PACE.mediumEasy, rpe: "3–4", flatOnly: true }),
        step("main", "Steady", { distanceKm: 3, targetType: "pace", targetPace: PACE.steady, rpe: "5–6", flatOnly: true }),
        step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
      ],
      structuredWorkoutText: `- Warmup 1km ${paceTarget(PACE.warmup)}\n- Medium long easy 6km ${paceTarget(PACE.mediumEasy)}\n- Steady 3km ${paceTarget(PACE.steady)}\n- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
    };
  }
  return continuousProfile(workout, PACE.mediumEasy, "3–4", "Średnio-długi easy");
}

function longProfile(workout) {
  const total = distanceOf(workout);
  const hilly = workout.workoutType === "LONG_RUN_HILLY";
  const easyPace = hilly ? `${PACE.longEasy} na płaskich fragmentach; na podbiegach według wysiłku` : PACE.longEasy;
  const mainKm = Math.max(1, total - 2);
  return {
    paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3. Część główna: ${mainKm} km easy ${easyPace}, RPE 3–4. Przerwy: nie dotyczy. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Long easy", { distanceKm: mainKm, targetType: "pace", targetPace: PACE.longEasy, rpe: "3–4", flatOnly: !hilly }),
      step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: `- Warmup 1km ${paceTarget(PACE.warmup)}\n- Long easy ${mainKm}km ${paceTarget(PACE.longEasy)}\n- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
  };
}

function longGateProfile(workout) {
  if (workout.date === "2026-08-15") {
    return {
      goalPaceConditional: true,
      paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3 w obu wariantach. Część główna — wariant 18 km: 16 km long easy ${PACE.longEasy}, RPE 3–4. Część główna — wariant 20 km tylko po spełnieniu bramki: 15 km long easy ${PACE.longEasy} + 3 km docelowego MP 3:30 ${PACE.goalMarathon}, RPE maks. 6. Przerwy: nie dotyczy. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
      structuredSteps: [
        step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
        step("main", "Long easy", { distanceKm: 15, targetType: "pace", targetPace: PACE.longEasy, rpe: "3–4", flatOnly: true }),
        step("conditional", "Docelowe MP 3:30", { distanceKm: 3, targetType: "pace", targetPace: PACE.goalMarathon, rpe: "≤6", flatOnly: true, conditional: true }),
        step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
      ],
      structuredWorkoutText: `- Warmup 1km ${paceTarget(PACE.warmup)}\n- Long easy 15km ${paceTarget(PACE.longEasy)}\n- Conditional goal MP 3km ${paceTarget(PACE.goalMarathon)}\n- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
    };
  }
  return {
    paceDisplay: `Rozgrzewka: 1 km ${PACE.warmup}, RPE 2–3 w każdym wariancie. Część główna — wariant 22 km easy: 20 km long easy ${PACE.longEasy}, RPE 3–4. Część główna — wariant 22 km z blokiem: 17 km long easy ${PACE.longEasy} + 3 km steady ${PACE.steady}, RPE 5–6. Część główna — wariant 24 km po zaliczeniu 15.08: 19 km long easy ${PACE.longEasy} + 3 km steady ${PACE.steady}, RPE 5–6. Przerwy: nie dotyczy. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: 1, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Long easy", { distanceKm: 19, targetType: "pace", targetPace: PACE.longEasy, rpe: "3–4", flatOnly: true }),
      step("conditional", "Steady", { distanceKm: 3, targetType: "pace", targetPace: PACE.steady, rpe: "5–6", flatOnly: true, conditional: true }),
      step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: `- Warmup 1km ${paceTarget(PACE.warmup)}\n- Long easy 19km ${paceTarget(PACE.longEasy)}\n- Conditional steady 3km ${paceTarget(PACE.steady)}\n- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
  };
}

function marathonEffortProfile(workout) {
  return {
    goalPaceConditional: true,
    paceDisplay: `Rozgrzewka: 2 km ${PACE.warmup}, RPE 2–3. Część główna: 6 km steady ${PACE.steady}, RPE 5–6. Wariant warunkowy po zaliczeniu obu bramek: 6 km docelowego MP 3:30 ${PACE.goalMarathon}, RPE maks. 6, zamiast steady. Przerwy: nie dotyczy. Schłodzenie: 2 km ${PACE.cooldown}, RPE 2–3. ${flatNote}`,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: 2, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Steady", { distanceKm: 6, targetType: "pace", targetPace: PACE.steady, rpe: "5–6", flatOnly: true }),
      step("conditional", "Docelowe MP 3:30", { distanceKm: 6, targetType: "pace", targetPace: PACE.goalMarathon, rpe: "≤6", flatOnly: true, conditional: true, alternativeToPrevious: true }),
      step("cooldown", "Schłodzenie", { distanceKm: 2, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: `- Warmup 2km ${paceTarget(PACE.warmup)}\n- Steady 6km ${paceTarget(PACE.steady)}\n- Conditional goal MP instead 6km ${paceTarget(PACE.goalMarathon)}\n- Cooldown 2km ${paceTarget(PACE.cooldown)}`,
  };
}

function marathonGateProfile() {
  return {
    goalPaceConditional: true,
    paceDisplay: `Rozgrzewka: 2 km ${PACE.warmup}, RPE 2–3. Część główna: 3 × 2 km — wariant A ${PACE.goalMarathon}, RPE maks. 6 wyłącznie po zaliczeniu bramek; wariant B 5:16–5:20/km; wariant C 5:24–5:34/km. Przerwy: 500 m truchtu ${PACE.recovery}, RPE 2–3. Schłodzenie: 1 km ${PACE.cooldown}, RPE 2–3. Wszystkie targety dotyczą płaskiego terenu.` ,
    structuredSteps: [
      step("warmup", "Rozgrzewka", { distanceKm: 2, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("repeat", "Wariant A — docelowe MP 3:30", { repetitions: 3, distanceKm: 2, targetType: "pace", targetPace: PACE.goalMarathon, rpe: "≤6", flatOnly: true, conditional: true }),
      step("recovery", "Trucht", { repetitions: 2, distanceKm: 0.5, targetType: "pace", targetPace: PACE.recovery, rpe: "2–3", flatOnly: true }),
      step("cooldown", "Schłodzenie", { distanceKm: 1, targetType: "pace", targetPace: PACE.cooldown, rpe: "2–3", flatOnly: true }),
    ],
    structuredWorkoutText: `- Warmup 2km ${paceTarget(PACE.warmup)}\n\nConditional goal MP calibration 3x\n- Goal MP 2km ${paceTarget(PACE.goalMarathon)}\n- Recovery 500m ${paceTarget(PACE.recovery)}\n\n- Cooldown 1km ${paceTarget(PACE.cooldown)}`,
  };
}

function raceProfile() {
  return {
    goalPaceConditional: true,
    paceDisplay: `Rozgrzewka: 10–15 min bardzo lekko, ${PACE.warmup}, RPE 2–3. Część główna: Plan A 3:30 — ${PACE.goalMarathon}, RPE początkowo 5–6, tylko po wszystkich bramkach; Plan B 5:16–5:20/km; Plan C 5:24–5:34/km. Przerwy: brak; punkty żywieniowe pokonuj według sytuacji. Schłodzenie: 10–15 min marszu lub truchtu, target otwarty, RPE 1–2. Tempo dotyczy płaskich fragmentów; na podbiegach utrzymuj wysiłek.` ,
    structuredSteps: [
      step("warmup", "Rozgrzewka przed startem", { durationMinutes: 12, targetType: "pace", targetPace: PACE.warmup, rpe: "2–3", flatOnly: true }),
      step("main", "Plan A 3:30", { distanceKm: 42.195, targetType: "pace", targetPace: PACE.goalMarathon, rpe: "5–7", flatOnly: false, conditional: true }),
      step("cooldown", "Marsz/trucht", { durationMinutes: 12, targetType: "open", targetPace: null, rpe: "1–2" }),
    ],
    structuredWorkoutText: `- Race controlled start 5km 4:58/km-5:02/km Pace\n- Race strategy block 32.195km ${paceTarget(PACE.goalMarathon)}\n- Finish by feel 5km 5-8 RPE`,
  };
}

function profileFor(workout) {
  if (workout.workoutType === "RECOVERY") return recoveryProfile(workout);
  if (workout.workoutType === "THRESHOLD") return thresholdProfile(workout);
  if (workout.workoutType === "HILLS") return hillsProfile(workout);
  if (workout.workoutType === "MEDIUM_LONG") return mediumLongProfile(workout);
  if (workout.workoutType === "LONG_RUN_GATE") return longGateProfile(workout);
  if (workout.workoutType === "MARATHON_EFFORT") return marathonEffortProfile(workout);
  if (workout.workoutType === "MARATHON_PACE_GATE") return marathonGateProfile(workout);
  if (workout.workoutType === "RACE") return raceProfile(workout);
  if (workout.workoutType.startsWith("LONG_RUN")) return longProfile(workout);
  if (/STRIDES|SHARPEN|TAPER_EASY/.test(workout.workoutType)) return stridesProfile(workout);
  return continuousProfile(workout, PACE.easy, "3–4", "Easy");
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const alternativeInstruction = workout => `Wybierz tylko jedną opcję z grupy ${workout.alternativeGroup}.`;
const normalizedConditions = workout => {
  const repeatedInstruction = /(?:\s*Wybierz tylko jedną opcję z grupy [^.]+\.)+\s*$/;
  const base = String(workout.conditions || "").replace(repeatedInstruction, "").trim();
  return `${base}${base ? " " : ""}${alternativeInstruction(workout)}`;
};
source.calibration = {
  tenKmResult: "40:08",
  testSurface: "bieżnia mechaniczna",
  treadmillGrade: "1%",
  testEffort: "maksymalny, bez przerw i bez trzymania poręczy",
  recoveryPace: PACE.recovery,
  easyPace: PACE.easy,
  longEasyPace: PACE.longEasy,
  mediumLongPace: PACE.mediumEasy,
  steadyPace: PACE.steady,
  goalMarathonPaceConditional: PACE.goalMarathon,
  thresholdPace: PACE.threshold,
  tenKPace: PACE.tenK,
  vo2Pace: PACE.vo2,
};
source.paceCatalog = {
  recovery: { pace: PACE.recovery, rpe: "2–3" },
  easy: { pace: PACE.easy, rpe: "3–4" },
  longEasy: { pace: PACE.longEasy, rpe: "3–4" },
  mediumLongEasy: { pace: PACE.mediumEasy, rpe: "3–4" },
  steady: { pace: PACE.steady, rpe: "5–6" },
  goalMarathonPace330: { pace: PACE.goalMarathon, rpe: "≤6", conditionalOnly: true },
  threshold: { pace: PACE.threshold, rpe: "7" },
  tenKIntervals: { pace: PACE.tenK, rpe: "7–8" },
  vo2Intervals: { pace: PACE.vo2, rpe: "8–9", durationMinutes: "2–5" },
  warmup: { pace: PACE.warmup, rpe: "2–3" },
  cooldown: { pace: PACE.cooldown, rpe: "2–3" },
};

source.raceStrategies = source.raceStrategies.map(strategy => strategy.code === "A"
  ? { ...strategy, pace: PACE.goalMarathon }
  : strategy);

source.workouts = source.workouts.map(workout => {
  if (workout.sport === "Run") {
    const normalizedWorkout = workout.workoutType === "MARATHON_EFFORT"
      ? {
          ...workout,
          name: "Steady 6 km / warunkowo goal MP",
          mainSet: "6 km steady; po zaliczeniu bramek opcjonalnie 6 km goal MP zamiast steady",
          conditions: "Goal MP 4:55–5:02/km wolno wykonać tylko po zaliczeniu bramek 15.08 i 22.08; ból 0–2/10, RPE maks. 6 i bez pogorszenia następnego ranka.",
        }
      : workout.workoutType === "LONG_RUN_GATE" && workout.date === "2026-08-22"
        ? {
            ...workout,
            mainSet: "22 km long easy. 24 km tylko po zaliczeniu 15.08. Opcjonalny blok 3 km steady, bez zwiększania dystansu.",
            planB: "22 km long easy albo 19 km long easy + jeden blok 3 km steady; bez docelowego MP.",
          }
        : workout.workoutType === "MARATHON_PACE_GATE"
          ? {
              ...workout,
              conditions: "Goal MP 4:55–5:02/km wykonuj wyłącznie po zaliczeniu wcześniejszych bramek. Zapisz RPE, ból i reakcję następnego ranka do decyzji 02.09; przy niespełnieniu warunków wybierz Plan B.",
            }
          : workout;
    const profile = profileFor(normalizedWorkout);
    const next = { ...normalizedWorkout, ...profile };
    const paceTargets = [...new Set(profile.structuredSteps.map(item => item.targetPace).filter(Boolean))];
    next.paceSummary = `${paceTargets.join(" • ")}${profile.effortBased ? `${paceTargets.length ? " • " : ""}odcinki wysiłkowo` : ""}`;
    next.pace = profile.paceDisplay;
    next.rpe = next.workoutType === "THRESHOLD" ? "7" : next.rpe;
    next.warmup = profile.structuredSteps.find(item => item.kind === "warmup")?.label + `: ${profile.paceDisplay.split(". ")[0].replace(/^Rozgrzewka:\s*/, "")}`;
    next.cooldown = profile.structuredSteps.find(item => item.kind === "cooldown")?.label + `: ${profile.paceDisplay.match(/Schłodzenie: ([^.]+)/)?.[1] || PACE.cooldown}`;
    if (next.alternativeGroup) next.conditions = normalizedConditions(next);
    return next;
  }
  if (workout.sport === "Ride" && workout.alternativeGroup) {
    return {
      ...workout,
      pace: "Z2; bez tempa biegowego",
      paceDisplay: "Rower Z2, RPE 3; bez tempa biegowego. Wybierz tylko jedną opcję ALT.",
      paceSummary: "Z2 • RPE 3",
      rpe: "3",
      conditions: normalizedConditions(workout),
    };
  }
  return { ...workout, paceDisplay: workout.paceDisplay || null };
});

await fs.writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
console.log(`Enriched ${source.workouts.filter(item => item.sport === "Run").length} Run workouts with paceDisplay and structuredSteps.`);
