import { getStore } from '@netlify/blobs';

const API_BASE = 'https://intervals.icu/api/v1';
const STORE_NAME = 'coach-center-intervals';
const SNAPSHOT_KEY = 'latest';

export function cors(json, status = 200) {
  return new Response(JSON.stringify(json, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function getDateRange() {
  const now = new Date();
  const oldest = process.env.INTERVALS_OLDEST_DATE || '2026-06-01';
  const newest = process.env.INTERVALS_NEWEST_DATE || isoDate(addDays(now, 7));
  const wellnessOldest = process.env.INTERVALS_WELLNESS_OLDEST_DATE || isoDate(addDays(now, -120));
  return { oldest, newest, wellnessOldest, wellnessNewest: isoDate(addDays(now, 1)) };
}

export function intervalsAuthHeader() {
  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    throw new Error('Brak zmiennej środowiskowej INTERVALS_API_KEY w Netlify.');
  }
  return 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64');
}

export async function intervalsGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      authorization: intervalsAuthHeader(),
      accept: 'application/json'
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Intervals API ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

export function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function activityDate(a) {
  return (a.start_date_local || a.start_date || a.date || '').slice(0, 10);
}

export function activityDistanceKm(a) {
  if (a.distance != null) return n(a.distance) / (n(a.distance) > 1000 ? 1000 : 1);
  if (a.distance_km != null) return n(a.distance_km);
  if (a.Distance != null) return n(a.Distance);
  return 0;
}

export function activityDurationHours(a) {
  const explicitHours = n(a.hours || a.duration_hours || a.durationHours);
  if (explicitHours) return explicitHours;
  const seconds = n(a.moving_time || a.movingTime || a.elapsed_time || a.elapsedTime || a.duration || a.time || a.total_timer_time);
  if (!seconds) return 0;
  return seconds / 3600;
}

export function activityLoad(a) {
  return n(a.icu_training_load || a.training_load || a.load || a.tss || a.TSS);
}

export function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

export function firstNumber(object, keys) {
  const value = firstValue(object, keys);
  return value == null ? 0 : n(value);
}

export function mapActivity(a) {
  return {
    id: firstValue(a, ['id', 'activity_id', 'activityId', 'icu_activity_id']),
    external_id: firstValue(a, ['external_id', 'externalId']),
    paired_event_id: firstValue(a, ['paired_event_id', 'pairedEventId', 'event_id', 'eventId', 'icu_event_id']),
    date: activityDate(a),
    start_date_local: firstValue(a, ['start_date_local', 'startDateLocal']),
    start_date: firstValue(a, ['start_date', 'startDate']),
    name: firstValue(a, ['name', 'title']) || firstValue(a, ['type', 'sport']) || 'Aktywność',
    type: firstValue(a, ['type', 'sport', 'activity_type', 'activityType']) || 'Other',
    km: Math.round(activityDistanceKm(a) * 100) / 100,
    hours: Math.round(activityDurationHours(a) * 1000) / 1000,
    moving_time: firstNumber(a, ['moving_time', 'movingTime']),
    elapsed_time: firstNumber(a, ['elapsed_time', 'elapsedTime']),
    load: Math.round(activityLoad(a)),
    avg_hr: firstNumber(a, ['average_heartrate', 'averageHeartRate', 'avg_hr', 'average_hr', 'avgHeartRate']) || null,
    max_hr: firstNumber(a, ['max_heartrate', 'maxHeartRate', 'max_hr', 'maximum_heartrate']) || null,
    avg_watts: firstNumber(a, ['average_watts', 'averageWatts', 'avg_watts', 'avgWatts']) || null,
    normalized_watts: firstNumber(a, ['normalized_watts', 'normalizedWatts', 'icu_weighted_avg_watts', 'weighted_average_watts', 'weightedAverageWatts']) || null,
    cadence: firstNumber(a, ['cadence', 'average_cadence', 'averageCadence', 'avg_cadence', 'avgCadence']) || null,
    elevation: firstNumber(a, ['total_elevation_gain', 'totalElevationGain', 'elevation_gain', 'elevationGain', 'elevation']) || null,
    calories: firstNumber(a, ['calories', 'calorie_count', 'calorieCount']) || null,
    speed: firstNumber(a, ['average_speed', 'averageSpeed', 'avg_speed', 'speed']) || null,
    pace: firstValue(a, ['average_pace', 'averagePace', 'pace']),
    url: firstValue(a, ['url', 'activity_url', 'activityUrl'])
  };
}

export function mapEvent(event) {
  return {
    id: firstValue(event, ['id', 'event_id', 'eventId', 'icu_event_id']),
    external_id: firstValue(event, ['external_id', 'externalId']),
    paired_activity_id: firstValue(event, ['paired_activity_id', 'pairedActivityId', 'activity_id', 'activityId']),
    start_date_local: firstValue(event, ['start_date_local', 'startDateLocal']),
    start_date: firstValue(event, ['start_date', 'startDate']),
    type: firstValue(event, ['type', 'sport', 'activity_type', 'activityType']) || 'Other',
    category: firstValue(event, ['category', 'event_category', 'eventCategory']),
    name: firstValue(event, ['name', 'title']) || 'Wydarzenie',
    description: firstValue(event, ['description', 'notes']),
    load: firstNumber(event, ['icu_training_load', 'icuTrainingLoad', 'training_load', 'trainingLoad', 'load', 'tss']) || null,
    moving_time: firstNumber(event, ['moving_time', 'movingTime', 'duration', 'duration_seconds', 'durationSeconds']) || null,
    distance: firstNumber(event, ['distance', 'distance_m', 'distanceMeters']) || null
  };
}

export function summarizeActivities(activities = []) {
  const byType = {};
  let km = 0, hours = 0, load = 0;
  let last = null;
  for (const a of activities) {
    const type = a.type || a.sport || a.activity_type || 'Other';
    byType[type] = (byType[type] || 0) + 1;
    km += activityDistanceKm(a);
    hours += activityDurationHours(a);
    load += activityLoad(a);
    const d = activityDate(a);
    if (d && (!last || d > last)) last = d;
  }
  return {
    count: activities.length,
    km: Math.round(km * 10) / 10,
    hours: Math.round(hours * 10) / 10,
    load: Math.round(load),
    byType,
    lastActivityDate: last
  };
}

export function filterSince(activities, days) {
  const cutoff = isoDate(addDays(new Date(), -days + 1));
  return activities.filter(a => activityDate(a) >= cutoff);
}

export function summarizeWellness(wellness = []) {
  const recent = wellness.slice().sort((a,b) => String(a.id || a.date).localeCompare(String(b.id || b.date))).slice(-14);
  const avg = (keys) => {
    const vals = recent.map(w => keys.map(k => n(w[k])).find(v => v > 0)).filter(Boolean);
    return vals.length ? Math.round((vals.reduce((a,b)=>a+b,0) / vals.length) * 10) / 10 : null;
  };
  const last = recent[recent.length - 1] || null;
  return {
    count: wellness.length,
    avgSleep: avg(['sleep_secs','sleep_time','sleep','total_sleep_hours']),
    avgRestingHR: avg(['restingHR','resting_hr','resting_heartrate']),
    avgHRV: avg(['hrv','hrv_rmssd','avg_hrv']),
    last
  };
}

export function computeSnapshot({ activities = [], wellness = [], events = [] }) {
  return {
    syncedAt: new Date().toISOString(),
    range: getDateRange(),
    totals: summarizeActivities(activities),
    last7: summarizeActivities(filterSince(activities, 7)),
    last14: summarizeActivities(filterSince(activities, 14)),
    last30: summarizeActivities(filterSince(activities, 30)),
    wellness: summarizeWellness(wellness),
    activities: activities.slice().sort((a, b) => String(activityDate(b)).localeCompare(String(activityDate(a)))).map(mapActivity),
    events: events.map(mapEvent),
    eventsCount: Array.isArray(events) ? events.length : 0
  };
}

export async function fetchIntervalsSnapshot() {
  const { oldest, newest, wellnessOldest, wellnessNewest } = getDateRange();
  const [activities, events, wellness] = await Promise.all([
    intervalsGet(`/athlete/0/activities?oldest=${oldest}&newest=${newest}`),
    intervalsGet(`/athlete/0/events?oldest=${oldest}&newest=${newest}`),
    intervalsGet(`/athlete/0/wellness?oldest=${wellnessOldest}&newest=${wellnessNewest}`).catch(() => [])
  ]);
  const snapshot = computeSnapshot({
    activities: Array.isArray(activities) ? activities : [],
    events: Array.isArray(events) ? events : [],
    wellness: Array.isArray(wellness) ? wellness : []
  });
  const store = getStore(STORE_NAME);
  await store.setJSON(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function getCachedSnapshot() {
  const store = getStore(STORE_NAME);
  return await store.get(SNAPSHOT_KEY, { type: 'json' });
}
