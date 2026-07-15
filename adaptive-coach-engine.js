(function (root, factory) {
  root.AdaptiveCoachEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const ENGINE_VERSION = 'adaptive-coach-v1.0.0';
  const REQUIRED_MANUAL_FIELDS = ['rpe', 'pain', 'sleep'];
  const QUALITY_TYPES = /THRESHOLD|INTERVAL|10K|VO2|MARATHON_PACE|HILL_REPEATS|HILL_SPRINTS|LONG_RUN/i;
  const EASY_TYPES = /^(EASY|EASY_STRIDES|RECOVERY)$/i;
  const GATES = [
    { date: '2026-08-15', label: 'Bramka 15.08' },
    { date: '2026-08-22', label: 'Bramka 22.08' },
    { date: '2026-09-01', label: 'Bramka 01.09' },
    { date: '2026-09-02', label: 'Decyzja startowa 02.09', decision: true }
  ];

  function text(value) {
    return String(value == null ? '' : value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function number(value) {
    if (value == null || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function dateOf(workout) {
    return String(workout?.dateISO || workout?.date || '').slice(0, 10);
  }

  function plannedRpe(workout) {
    const matches = String(workout?.rpe || '').match(/\d+(?:[.,]\d+)?/g) || [];
    const values = matches.map(number).filter(value => value != null);
    return values.length ? Math.max(...values) : null;
  }

  function workoutType(workout) {
    return String(workout?.workoutType || workout?.Typ || workout?.type || '').toUpperCase();
  }

  function workoutName(workout) {
    return String(workout?.name || workout?.discipline || workout?.Dyscyplina || 'Trening');
  }

  function workoutSport(workout) {
    const source = text(`${workout?.sport || ''} ${workoutName(workout)}`);
    if (/strength|sila|silown/.test(source)) return 'strength';
    if (/ride|rower|tacx|bike/.test(source)) return 'ride';
    if (/swim|basen|plyw/.test(source)) return 'swim';
    if (/run|bieg|long|prog|podbieg|maraton/.test(source)) return 'run';
    return 'other';
  }

  function isRequired(workout) {
    return workout && workout.required !== false && !workout.optional && !/REST|NOTE|DECISION/.test(workoutType(workout));
  }

  function isQuality(workout) {
    return Boolean(workout?.quality) || QUALITY_TYPES.test(workoutType(workout)) || /PROGOWY|INTERWAŁOWY|MARATOŃSKI|PODBIEGI|VO2/.test(String(workout?.intensity || '').toUpperCase());
  }

  function isLong(workout) {
    return /LONG_RUN/.test(workoutType(workout)) || /\blong\b|długi bieg/i.test(workoutName(workout));
  }

  function isAlt(workout) {
    return Boolean(workout?.alternativeGroup) || /\bALT\b/i.test(workoutName(workout));
  }

  function completionPercent(workout, execution) {
    const explicit = number(execution?.done ?? execution?.completionPercentage ?? execution?.completion);
    if (explicit != null && explicit > 0) return Math.round(explicit);
    const plannedKm = number(workout?.plannedKm ?? workout?.distanceKm ?? workout?.['Dystans km']);
    const actualKm = number(execution?.km ?? execution?.distanceKm);
    if (plannedKm && actualKm != null) return Math.round(actualKm / plannedKm * 100);
    const plannedMinutes = number(workout?.plannedMinutes ?? workout?.durationMinutes ?? workout?.['Czas min']);
    const actualMinutes = number(execution?.time ?? execution?.minutes);
    if (plannedMinutes && actualMinutes != null) return Math.round(actualMinutes / plannedMinutes * 100);
    return null;
  }

  function explicitSafetySignals(manual, execution) {
    const source = text(`${manual?.notes || ''} ${execution?.notes || ''} ${execution?.statusReason || ''}`);
    return {
      gaitChanged: /zmian[aey]? kroku|zmienil.*krok|altered gait|limp|utyk/.test(source),
      painIncreasing: /narastaj.*bol|bol.*narast|increasing pain/.test(source),
      stoppedForPain: /przerw.*(?:przez|z powodu).*bol|stopped.*pain/.test(source)
    };
  }

  function loadTrend(history, referenceDate) {
    const ref = new Date(`${referenceDate}T12:00:00Z`).getTime();
    const samples = (history || []).map(entry => ({
      date: dateOf(entry.workout) || String(entry.execution?.activityDate || entry.execution?.date || '').slice(0, 10),
      load: number(entry.execution?.load)
    })).filter(entry => entry.date && entry.load != null);
    const recent = samples.filter(entry => { const age = (ref - new Date(`${entry.date}T12:00:00Z`).getTime()) / 864e5; return age >= 0 && age < 7; });
    const baseline = samples.filter(entry => { const age = (ref - new Date(`${entry.date}T12:00:00Z`).getTime()) / 864e5; return age >= 7 && age < 35; });
    const baselineWeeks = new Set(baseline.map(entry => Math.floor((ref - new Date(`${entry.date}T12:00:00Z`).getTime()) / 864e5 / 7)));
    if (recent.length < 2 || baseline.length < 4 || baselineWeeks.size < 3) return { available: false };
    const load7 = recent.reduce((sum, entry) => sum + entry.load, 0);
    const previous28 = baseline.reduce((sum, entry) => sum + entry.load, 0);
    const weeklyAverage28 = previous28 / 4;
    return { available: weeklyAverage28 > 0, load7, weeklyAverage28, ratio: weeklyAverage28 > 0 ? load7 / weeklyAverage28 : null, warning: weeklyAverage28 > 0 && load7 > weeklyAverage28 * 1.3 };
  }

  function previousPoorSleep(history, beforeDate) {
    return (history || []).filter(entry => dateOf(entry.workout) < beforeDate).sort((a, b) => dateOf(b.workout).localeCompare(dateOf(a.workout))).slice(0, 1).some(entry => {
      const sleep = number(entry.manual?.sleep ?? entry.execution?.sleep);
      return sleep != null && sleep < 6;
    });
  }

  function findNextWorkout(plan, afterDate, afterWorkoutId = '') {
    const future = (plan || []).filter(item => isRequired(item) && (dateOf(item) > afterDate || (dateOf(item) === afterDate && String(item.id) > String(afterWorkoutId)))).sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || String(a.id).localeCompare(String(b.id)));
    return future[0] || null;
  }

  function recommendedFor(status, nextWorkout) {
    if (!nextWorkout) return { action: 'Brak kolejnego obowiązkowego treningu w planie.', variant: 'brak' };
    const planB = nextWorkout.planB || nextWorkout.modification || nextWorkout['Modyfikacja jeśli zmęczenie/ból'] || '';
    if (status === 'red') return { action: 'Wolne. Ewentualnie bardzo lekki rower Z1/Z2 wyłącznie bez bólu; bez jakości i siły nóg.', variant: 'wolne' };
    if (status === 'green') {
      if (isAlt(nextWorkout)) return { action: 'Wybierz jedną opcję zgodnie z planem; nie wykonuj obu.', variant: 'Plan A / jedna opcja ALT' };
      return { action: 'Wykonaj trening zgodnie z planem, bez zwiększania dystansu ani tempa.', variant: 'Plan A' };
    }
    if (isAlt(nextWorkout)) return { action: 'Wybierz wyłącznie rower Z2; nie wykonuj obu opcji ALT.', variant: 'rower Z2' };
    if (isLong(nextWorkout)) return { action: planB || 'Wykonaj dolną granicę zaplanowanego dystansu wyłącznie easy.', variant: planB ? 'Plan B' : 'dolna granica easy' };
    if (planB) return { action: planB, variant: 'Plan B' };
    if (isQuality(nextWorkout)) return { action: 'Zamiast jakości wykonaj easy albo rower Z2.', variant: 'easy / rower Z2' };
    if (workoutSport(nextWorkout) === 'strength' && nextWorkout.optional) return { action: 'Pomiń opcjonalną siłę.', variant: 'pomiń' };
    return { action: 'Zmniejsz obciążenie i utrzymaj spokojne RPE; bez dokładania.', variant: 'easy' };
  }

  function evaluate(options) {
    const workout = options?.workout || {};
    const execution = options?.execution || {};
    const manual = options?.manual || execution || {};
    const history = options?.history || [];
    const referenceDate = dateOf(workout) || String(execution.activityDate || execution.date || '').slice(0, 10);
    const nextWorkout = options?.nextWorkout || findNextWorkout(options?.plan || [], referenceDate, workout.id || '');
    const completion = completionPercent(workout, execution);
    const rpe = number(manual.rpe);
    const pain = number(manual.pain);
    const sleep = number(manual.sleep);
    const mental = number(manual.mental);
    const expectedRpe = plannedRpe(workout);
    const safety = explicitSafetySignals(manual, execution);
    const trend = loadTrend(history, referenceDate);
    const missing = REQUIRED_MANUAL_FIELDS.filter(field => number(manual[field]) == null);
    const reasons = [];
    let level = 0;

    if (completion != null) {
      if (completion < 75) { level = Math.max(level, 1); reasons.push(`Wykonanie ${completion}% planu.`); }
      else if (completion < 90 || completion > 110) { level = Math.max(level, 1); reasons.push(`Wykonanie ${completion}% jest poza zakresem 90–110%.`); }
      if (completion > 120) { level = Math.max(level, 1); }
    }
    if (pain != null && pain >= 4) { level = 2; reasons.push(`Ból ${pain}/10 — obowiązuje reguła bezpieczeństwa.`); }
    else if (pain === 3) { level = Math.max(level, 1); reasons.push('Ból 3/10 — bez zwiększania obciążenia.'); }
    if (safety.gaitChanged || safety.painIncreasing || safety.stoppedForPain) { level = 2; reasons.push('Zgłoszono zmianę kroku, narastający ból lub przerwanie przez ból.'); }
    if (rpe != null && EASY_TYPES.test(workoutType(workout)) && rpe >= 6) { level = Math.max(level, rpe >= 9 ? 2 : 1); reasons.push(`Spokojny trening osiągnął RPE ${rpe}.`); }
    if (rpe != null && expectedRpe != null && rpe >= expectedRpe + 2) { level = Math.max(level, completion != null && completion < 75 ? 2 : 1); reasons.push(`RPE ${rpe} przekroczyło planowane maksimum ${expectedRpe}.`); }
    if (sleep != null && sleep < 5) { level = Math.max(level, 1); reasons.push(`Bardzo krótki sen: ${sleep} h.`); }
    else if (sleep != null && sleep < 6) { level = Math.max(level, 1); reasons.push(`Słaby sen: ${sleep} h.`); }
    if (sleep != null && sleep < 6 && previousPoorSleep(history, referenceDate)) { level = Math.max(level, 1); reasons.push('Dwie kolejne słabe oceny snu.'); }
    if (mental != null && mental <= 3) { level = Math.max(level, 1); reasons.push(`Niskie samopoczucie: ${mental}/10.`); }
    if (trend.warning) { level = Math.max(level, 1); reasons.push(`Load 7 dni jest o ${Math.round((trend.ratio - 1) * 100)}% wyższy od średniej z poprzednich 28 dni.`); }
    if (completion != null && completion < 75 && rpe != null && rpe >= 8) { level = 2; reasons.push('Niskie wykonanie i wysokie RPE wystąpiły jednocześnie.'); }
    if (!reasons.length) reasons.push(completion == null ? 'Brak pełnych danych wykonania do porównania z planem.' : `Wykonanie ${completion}% mieści się w bezpiecznym zakresie.`);

    const status = ['green', 'yellow', 'red'][level];
    const action = recommendedFor(status, nextWorkout);
    const confidence = !execution || !Object.keys(execution).length ? 'insufficient' : missing.length ? 'provisional' : 'full';
    const generatedAt = options?.generatedAt || execution.lastSyncedAt || execution.updated || (referenceDate ? `${referenceDate}T12:00:00.000Z` : '');
    const result = {
      status,
      confidence,
      headline: status === 'green' ? 'ZIELONY — kontynuuj plan' : status === 'yellow' ? 'ŻÓŁTY — zmniejsz obciążenie' : 'CZERWONY — bez jakościowego biegu',
      reasons: reasons.slice(0, 6),
      recommendedAction: action.action,
      nextWorkoutId: nextWorkout?.id || null,
      nextWorkoutName: nextWorkout ? workoutName(nextWorkout) : null,
      recommendedVariant: action.variant,
      generatedAt,
      engineVersion: ENGINE_VERSION,
      missingData: missing,
      scope: execution.laps || execution.intervals ? 'activity-and-available-laps' : 'whole-activity',
      usedInputs: {
        workoutId: workout.id || null, sport: workoutSport(workout), workoutType: workoutType(workout), intensity: workout.intensity || null,
        plannedPace: workout.paceDisplay || workout.pace || null, plannedRpe: workout.rpe || null, planB: workout.planB || workout.modification || null,
        completionPercentage: completion, minutes: number(execution.time ?? execution.minutes), distanceKm: number(execution.km ?? execution.distanceKm),
        pace: execution.pace ?? null, avgHr: number(execution.avgHr), maxHr: number(execution.maxHr), avgWatts: number(execution.avgWatts), normalizedWatts: number(execution.normalizedWatts), cadence: number(execution.cadence), elevation: number(execution.elevation), calories: number(execution.calories), load: number(execution.load),
        rpe, pain, sleep, mental, fuelProvided: Boolean(manual.fuel), noteProvided: Boolean(manual.notes), safetySignals: safety,
        loadTrend: trend.available ? trend : null
      }
    };
    return result;
  }

  function evaluateHistory({ plan = [], logs = {}, limit = 5 } = {}) {
    return plan.filter(workout => logs[workout.id] && (logs[workout.id].autoSource || logs[workout.id].status || logs[workout.id].updated))
      .map(workout => ({ workout, result: evaluate({ workout, execution: logs[workout.id], manual: logs[workout.id], plan, history: plan.map(item => ({ workout: item, execution: logs[item.id] || {}, manual: logs[item.id] || {} })) }) }))
      .sort((a, b) => dateOf(b.workout).localeCompare(dateOf(a.workout)) || String(b.workout.id).localeCompare(String(a.workout.id))).slice(0, limit);
  }

  function gateStatuses({ plan = [], logs = {}, nowDate } = {}) {
    const today = String(nowDate || new Date().toISOString()).slice(0, 10);
    const byDate = date => plan.filter(item => dateOf(item) === date && (item.strategyGate || /BRAMKA|DECYZJA/.test(workoutName(item).toUpperCase())));
    const statuses = [];
    for (const gate of GATES) {
      if (gate.decision) {
        const prerequisites = statuses.filter(item => !item.decision);
        statuses.push({ ...gate, decision: true, status: today < gate.date ? 'oczekuje' : prerequisites.every(item => item.status === 'zaliczona') ? 'zaliczona' : prerequisites.some(item => item.status === 'oczekuje') ? 'oczekuje' : 'niezaliczona' });
        continue;
      }
      const workouts = byDate(gate.date).filter(item => workoutSport(item) === 'run');
      const workout = workouts[0];
      const log = workout ? logs[workout.id] : null;
      if (today < gate.date) statuses.push({ ...gate, status: 'oczekuje', workoutId: workout?.id || null });
      else if (!workout || !log || !log.autoSource) statuses.push({ ...gate, status: 'brak danych', workoutId: workout?.id || null });
      else if (number(log.rpe) == null || number(log.pain) == null) statuses.push({ ...gate, status: 'brak danych', workoutId: workout.id, reason: 'Wymagane są RPE i ból.' });
      else {
        const result = evaluate({ workout, execution: log, manual: log, plan });
        const nextDayBad = /pogorszenie|sztywn|bol/i.test(String(log.nextDayReaction || log.notes || ''));
        const lapEvidence = Array.isArray(log.laps) && log.laps.some(lap => lap?.targetMet === true || lap?.paceCompliance === true);
        const requiredPaceMet = log.requiredPaceMet === true || log.paceCompliance === true || lapEvidence;
        const passed = result.status === 'green' && requiredPaceMet && !nextDayBad;
        statuses.push({ ...gate, status: !requiredPaceMet ? 'brak danych' : passed ? 'zaliczona' : 'niezaliczona', workoutId: workout.id, reason: !requiredPaceMet ? 'Brak potwierdzenia realizacji wymaganych bloków tempa.' : nextDayBad ? 'Negatywna reakcja następnego dnia.' : result.headline });
      }
    }
    return statuses;
  }

  return { ENGINE_VERSION, evaluate, evaluateHistory, gateStatuses, findNextWorkout, completionPercent, loadTrend, isQuality, isRequired };
});
