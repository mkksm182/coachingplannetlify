(function (root, factory) {
  root.IntervalsAutofillEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const MANUAL_FIELDS = ['rpe', 'pain', 'sleep', 'mental', 'fuel', 'shoes', 'notes'];

  function text(value) {
    return String(value == null ? '' : value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function numberFrom(object, keys) {
    for (const key of keys) {
      const value = object?.[key];
      if (value == null || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return 0;
  }

  function valueFrom(object, keys) {
    for (const key of keys) {
      const value = object?.[key];
      if (value != null && value !== '') return value;
    }
    return null;
  }

  function isoDate(value) {
    return String(value || '').slice(0, 10);
  }

  function activityId(activity) {
    return String(valueFrom(activity, ['id', 'activity_id', 'activityId', 'icu_activity_id']) || '');
  }

  function activityDate(activity) {
    return isoDate(valueFrom(activity, ['date', 'start_date_local', 'startDateLocal', 'start_date', 'startDate', 'startTime']));
  }

  function activitySport(activity) {
    const explicit = text(valueFrom(activity, ['type', 'sport', 'activity_type', 'activityType']));
    const source = explicit || text(valueFrom(activity, ['name', 'title']));
    if (/swim|plyw|basen|openwater|open water/.test(source)) return 'swim';
    if (/ride|bike|bicycle|cycling|virtualride|virtual ride|tacx|rower/.test(source)) return 'ride';
    if (/run|running|bieg|treadmill|trailrun|trail run/.test(source)) return 'run';
    if (/strength|weight|gym|silown|sila|cardio/.test(source)) return 'strength';
    return 'other';
  }

  function isRest(item) {
    const discipline = text(item?.discipline || item?.['Dyscyplina']);
    return /(^|[\s/+-])(wolne|rest|off)([\s/+-]|$)/.test(discipline) &&
      !/(bieg|run|tacx|rower|ride|bike|basen|plyw|swim|silown|strength)/.test(discipline);
  }

  function planSports(item) {
    if (isRest(item)) return ['rest'];
    const discipline = text(item?.discipline || item?.['Dyscyplina']);
    const description = text(item?.description || item?.['Szczegółowy opis treningu']);
    const source = `${discipline} ${description}`;
    const sports = [];
    if (/basen|plyw|kraul|open water|swim/.test(source)) sports.push('swim');
    if (/tacx|rower|bike|ride|ftp|wat|sweet spot|cycling/.test(source)) sports.push('ride');
    if (/bieg|run|trucht|marszobieg|rytmy|podbieg|kros|maraton|\b10\s*km\b|\b21[,.]1\s*km\b|solo tt|t2/.test(source)) sports.push('run');
    if (/silown|sila|prehab|core|strength|gym/.test(source)) sports.push('strength');
    return [...new Set(sports.length ? sports : ['other'])];
  }

  function parseMinutes(source) {
    const direct = numberFrom(source, ['plannedMinutes', 'minutes', 'duration_minutes', 'durationMinutes']);
    if (direct > 0) return direct;
    const value = text([source?.builderText, source?.description, source?.sourceDescription].filter(Boolean).join(' ')).replace(',', '.');
    let match = value.match(/(\d+(?:\.\d+)?)\s*(?:h|godz)/);
    if (match) return Math.round(Number(match[1]) * 60);
    match = value.match(/(\d+)\s*(?:min|m)\b/);
    return match ? Number(match[1]) : 0;
  }

  function parseKm(source) {
    const direct = numberFrom(source, ['plannedKm', 'distance_km', 'distanceKm']);
    if (direct > 0) return direct;
    const value = text([source?.builderText, source?.description, source?.sourceDescription].filter(Boolean).join(' ')).replace(',', '.');
    const distances = [...value.matchAll(/(\d+(?:\.\d+)?)\s*km/g)].map(match => Number(match[1])).filter(Boolean);
    return distances.length ? Math.max(...distances) : 0;
  }

  function activityMetrics(activity) {
    const hours = numberFrom(activity, ['hours']);
    const seconds = numberFrom(activity, ['moving_time', 'movingTime', 'elapsed_time', 'elapsedTime', 'duration', 'time', 'total_timer_time']);
    const minutes = hours > 0 ? Math.round(hours * 60) : seconds > 0 ? Math.round(seconds > 600 ? seconds / 60 : seconds) : numberFrom(activity, ['minutes', 'min']);
    const kmDirect = numberFrom(activity, ['km', 'distance_km', 'distanceKm']);
    const distance = numberFrom(activity, ['distance', 'Distance']);
    const km = kmDirect > 0 ? kmDirect : distance > 0 ? (distance > 1000 ? distance / 1000 : distance) : 0;
    return {
      activityId: activityId(activity),
      name: String(valueFrom(activity, ['name', 'title']) || valueFrom(activity, ['type', 'sport']) || 'Aktywność'),
      date: activityDate(activity),
      startDateLocal: valueFrom(activity, ['start_date_local', 'startDateLocal']),
      startDate: valueFrom(activity, ['start_date', 'startDate']),
      sport: activitySport(activity),
      minutes: Math.round(minutes || 0),
      km: Math.round((km || 0) * 100) / 100,
      load: numberFrom(activity, ['load', 'icu_training_load', 'icuTrainingLoad', 'training_load', 'trainingLoad', 'tss', 'TSS']),
      avgHr: numberFrom(activity, ['avg_hr', 'average_heartrate', 'averageHeartRate', 'average_hr', 'avgHeartRate']),
      maxHr: numberFrom(activity, ['max_hr', 'max_heartrate', 'maxHeartRate', 'maximum_heartrate']),
      avgWatts: numberFrom(activity, ['avg_watts', 'average_watts', 'averageWatts', 'avgWatts']),
      normalizedWatts: numberFrom(activity, ['normalized_watts', 'normalizedWatts', 'icu_weighted_avg_watts', 'weighted_average_watts', 'weightedAverageWatts']),
      cadence: numberFrom(activity, ['cadence', 'average_cadence', 'averageCadence', 'avg_cadence', 'avgCadence']),
      elevation: numberFrom(activity, ['elevation', 'total_elevation_gain', 'totalElevationGain', 'elevation_gain', 'elevationGain']),
      calories: numberFrom(activity, ['calories', 'calorie_count', 'calorieCount']),
      speed: numberFrom(activity, ['speed', 'average_speed', 'averageSpeed', 'avg_speed']),
      pace: valueFrom(activity, ['pace', 'average_pace', 'averagePace']),
      pairedEventId: String(valueFrom(activity, ['paired_event_id', 'pairedEventId', 'event_id', 'eventId', 'icu_event_id']) || ''),
      externalId: String(valueFrom(activity, ['external_id', 'externalId']) || ''),
      url: valueFrom(activity, ['url', 'activity_url', 'activityUrl'])
    };
  }

  function eventId(event) {
    return String(valueFrom(event, ['id', 'event_id', 'eventId', 'icu_event_id']) || '');
  }

  function eventExternalId(event) {
    return String(valueFrom(event, ['external_id', 'externalId']) || '');
  }

  function eventPairedActivityId(event) {
    return String(valueFrom(event, ['paired_activity_id', 'pairedActivityId', 'activity_id', 'activityId']) || '');
  }

  function makeParts(items, structuredWorkouts) {
    const itemById = new Map(items.map(item => [String(item.id), item]));
    const parts = [];
    const parentsWithWorkout = new Set();
    for (const workout of structuredWorkouts || []) {
      if (String(workout.category || '').toUpperCase() !== 'WORKOUT') continue;
      const parentId = String(workout.parentId || '');
      const parent = itemById.get(parentId);
      if (!parent) continue;
      const sport = activitySport({ type: workout.type, name: workout.title });
      const id = String(workout.id || `${parentId}:${sport}`);
      parentsWithWorkout.add(parentId);
      parts.push({ id, externalId: id, parentId, dateISO: workout.dateISO || parent.dateISO, sport, plannedMinutes: parseMinutes(workout) || parseMinutes(parent), plannedKm: parseKm(workout) || parseKm(parent), title: workout.title || parent.discipline });
    }
    for (const item of items) {
      if (isRest(item) || parentsWithWorkout.has(String(item.id))) continue;
      for (const sport of planSports(item).filter(value => value !== 'rest')) {
        parts.push({ id: `plan:${item.id}:${sport}`, externalId: String(item.id), parentId: String(item.id), dateISO: item.dateISO, sport, plannedMinutes: parseMinutes(item), plannedKm: parseKm(item), title: item.discipline });
      }
    }
    return parts;
  }

  function parentIdFromExternalId(externalId, parts, itemIds) {
    if (!externalId) return '';
    const exactPart = parts.find(part => part.externalId === externalId || part.id === externalId);
    if (exactPart) return exactPart.parentId;
    if (itemIds.has(externalId)) return externalId;
    for (const id of itemIds) if (externalId.includes(id)) return id;
    return '';
  }

  function partForExternalId(externalId, sport, parts, itemIds) {
    const exact = parts.find(part => part.externalId === externalId || part.id === externalId);
    if (exact && (sport === 'other' || exact.sport === sport)) return exact;
    const parentId = parentIdFromExternalId(externalId, parts, itemIds);
    const candidates = parts.filter(part => part.parentId === parentId && (sport === 'other' || part.sport === sport));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function dayDifference(left, right) {
    const a = new Date(`${left}T12:00:00Z`).getTime();
    const b = new Date(`${right}T12:00:00Z`).getTime();
    return Math.round(Math.abs(a - b) / 864e5);
  }

  function metricDifference(actual, planned) {
    if (!(actual > 0) || !(planned > 0)) return null;
    return Math.abs(actual - planned) / Math.max(actual, planned);
  }

  function sensibleFallbackCandidates(metrics, parts) {
    return parts.filter(part => {
      if (part.sport !== metrics.sport || dayDifference(part.dateISO, metrics.date) > 1) return false;
      const durationDiff = metricDifference(metrics.minutes, part.plannedMinutes);
      const distanceDiff = metricDifference(metrics.km, part.plannedKm);
      if (durationDiff == null && distanceDiff == null) return true;
      return Math.min(durationDiff == null ? 1 : durationDiff, distanceDiff == null ? 1 : distanceDiff) <= 0.6;
    });
  }

  function keepManualFields(previous, next) {
    for (const field of MANUAL_FIELDS) if (previous?.[field] != null) next[field] = previous[field];
    return next;
  }

  function autoPart(metrics) {
    return {
      activityId: metrics.activityId,
      status: 'OK',
      time: String(metrics.minutes || ''),
      km: String(metrics.km || ''),
      load: metrics.load,
      avgHr: metrics.avgHr,
      maxHr: metrics.maxHr,
      avgWatts: metrics.avgWatts,
      normalizedWatts: metrics.normalizedWatts,
      cadence: metrics.cadence,
      elevation: metrics.elevation,
      calories: metrics.calories,
      speed: metrics.speed,
      pace: metrics.pace,
      activityName: metrics.name,
      activityDate: metrics.date,
      autoSource: 'Intervals auto',
      autoMatchedAt: new Date().toISOString()
    };
  }

  function aggregateParent(parentId, logs, parts) {
    const parentParts = parts.filter(part => part.parentId === parentId);
    const previous = logs[parentId] || {};
    const savedParts = previous.parts || {};
    const completed = parentParts.filter(part => savedParts[part.id]?.activityId);
    if (!completed.length) return;
    const totals = completed.reduce((sum, part) => {
      const value = savedParts[part.id];
      sum.minutes += Number(value.time) || 0;
      sum.km += Number(value.km) || 0;
      sum.load += Number(value.load) || 0;
      sum.elevation += Number(value.elevation) || 0;
      sum.calories += Number(value.calories) || 0;
      return sum;
    }, { minutes: 0, km: 0, load: 0, elevation: 0, calories: 0 });
    const average = key => {
      const values = completed.map(part => Number(savedParts[part.id][key])).filter(value => value > 0);
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    };
    const maximum = key => Math.max(0, ...completed.map(part => Number(savedParts[part.id][key]) || 0));
    const plannedMinutes = parentParts.reduce((sum, part) => sum + (part.plannedMinutes || 0), 0);
    const plannedKm = parentParts.reduce((sum, part) => sum + (part.plannedKm || 0), 0);
    const done = plannedMinutes > 0 ? totals.minutes / plannedMinutes * 100 : plannedKm > 0 ? totals.km / plannedKm * 100 : completed.length / parentParts.length * 100;
    const next = {
      ...previous,
      parts: savedParts,
      status: completed.length === parentParts.length ? 'OK' : 'Częściowo',
      time: String(totals.minutes || ''),
      km: String(Math.round(totals.km * 100) / 100 || ''),
      load: Math.round(totals.load),
      avgHr: average('avgHr'),
      maxHr: maximum('maxHr'),
      avgWatts: average('avgWatts'),
      normalizedWatts: average('normalizedWatts'),
      cadence: average('cadence'),
      elevation: Math.round(totals.elevation),
      calories: Math.round(totals.calories),
      activityName: completed.map(part => savedParts[part.id].activityName).filter(Boolean).join(' + '),
      done: String(Math.round(Math.min(130, done || 0))),
      autoSource: 'Intervals auto',
      autoActivityIds: completed.map(part => savedParts[part.id].activityId).join(','),
      updated: new Date().toISOString()
    };
    logs[parentId] = keepManualFields(previous, next);
  }

  function standaloneRecord(metrics, status, candidateIds) {
    return {
      id: metrics.activityId,
      intervalsId: metrics.activityId,
      date: metrics.date,
      startDateLocal: metrics.startDateLocal,
      startDate: metrics.startDate,
      name: metrics.name,
      sport: metrics.sport,
      status,
      time: metrics.minutes,
      km: metrics.km,
      load: metrics.load,
      avgHr: metrics.avgHr,
      maxHr: metrics.maxHr,
      avgWatts: metrics.avgWatts,
      normalizedWatts: metrics.normalizedWatts,
      cadence: metrics.cadence,
      elevation: metrics.elevation,
      calories: metrics.calories,
      speed: metrics.speed,
      pace: metrics.pace,
      url: metrics.url,
      candidatePartIds: candidateIds || [],
      autoSource: 'Intervals auto',
      updated: new Date().toISOString()
    };
  }

  function sync(options) {
    const items = options.items || [];
    const structuredWorkouts = options.structuredWorkouts || [];
    const activities = options.activities || [];
    const events = options.events || [];
    const logs = JSON.parse(JSON.stringify(options.logs || {}));
    const standalone = JSON.parse(JSON.stringify(options.standalone || {}));
    const parts = makeParts(items, structuredWorkouts);
    const itemIds = new Set(items.map(item => String(item.id)));
    const eventById = new Map(events.map(event => [eventId(event), event]).filter(([id]) => id));
    const eventByActivityId = new Map(events.map(event => [eventPairedActivityId(event), event]).filter(([id]) => id));
    const partOwners = new Map();
    for (const log of Object.values(logs)) {
      for (const [partId, savedPart] of Object.entries(log?.parts || {})) {
        if (savedPart?.activityId) partOwners.set(partId, String(savedPart.activityId));
      }
    }
    const matched = [];
    const pending = [];
    const outsidePlan = [];

    for (const activity of activities) {
      const metrics = activityMetrics(activity);
      if (!metrics.activityId || !metrics.date) continue;
      let part = null;
      let matchMethod = '';
      const relatedEvent = eventById.get(metrics.pairedEventId) || eventByActivityId.get(metrics.activityId);
      if (relatedEvent) {
        part = partForExternalId(eventExternalId(relatedEvent), metrics.sport, parts, itemIds);
        if (part) matchMethod = 'paired_event_id';
      }
      if (!part && metrics.externalId) {
        part = partForExternalId(metrics.externalId, metrics.sport, parts, itemIds);
        if (part) matchMethod = 'external_id';
      }
      if (!part) {
        const candidates = sensibleFallbackCandidates(metrics, parts);
        if (candidates.length === 1) {
          part = candidates[0];
          matchMethod = 'fallback';
        } else if (candidates.length > 1) {
          standalone[metrics.activityId] = standaloneRecord(metrics, 'Wymaga przypisania', candidates.map(candidate => candidate.id));
          pending.push(metrics.activityId);
          continue;
        }
      }
      const currentOwner = part && partOwners.get(part.id);
      if (part && currentOwner && currentOwner !== metrics.activityId) {
        standalone[metrics.activityId] = standaloneRecord(metrics, 'Wymaga przypisania', [part.id]);
        pending.push(metrics.activityId);
        continue;
      }
      if (!part) {
        standalone[metrics.activityId] = standaloneRecord(metrics, 'Poza planem', []);
        outsidePlan.push(metrics.activityId);
        continue;
      }
      delete standalone[metrics.activityId];
      const parent = logs[part.parentId] || {};
      const savedParts = { ...(parent.parts || {}) };
      savedParts[part.id] = { ...autoPart(metrics), matchMethod, eventId: relatedEvent ? eventId(relatedEvent) : '' };
      partOwners.set(part.id, metrics.activityId);
      logs[part.parentId] = keepManualFields(parent, { ...parent, parts: savedParts });
      aggregateParent(part.parentId, logs, parts);
      matched.push({ activityId: metrics.activityId, parentId: part.parentId, partId: part.id, method: matchMethod });
    }
    return { logs, standalone, matched, pending, outsidePlan, parts };
  }

  function statistics(activities) {
    const values = (activities || []).map(activityMetrics);
    return values.reduce((sum, activity) => {
      sum.count += 1;
      sum.minutes += activity.minutes || 0;
      sum.km += activity.km || 0;
      sum.load += activity.load || 0;
      return sum;
    }, { count: 0, minutes: 0, km: 0, load: 0 });
  }

  return { activityMetrics, activitySport, isRest, makeParts, planSports, statistics, sync };
});
