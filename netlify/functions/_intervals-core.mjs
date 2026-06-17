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
  const seconds = n(a.moving_time || a.elapsed_time || a.duration || a.time || a.total_timer_time);
  if (!seconds) return 0;
  return seconds > 600 ? seconds / 3600 : seconds / 60;
}

export function activityLoad(a) {
  return n(a.icu_training_load || a.training_load || a.load || a.tss || a.TSS);
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
    activities: activities.slice(-60).reverse().map(a => ({
      id: a.id,
      date: activityDate(a),
      name: a.name || a.title || a.type || 'Aktywność',
      type: a.type || a.sport || 'Other',
      km: Math.round(activityDistanceKm(a) * 10) / 10,
      hours: Math.round(activityDurationHours(a) * 10) / 10,
      load: Math.round(activityLoad(a)),
      avg_hr: a.average_heartrate || a.avg_hr || a.average_hr || null,
      avg_watts: a.average_watts || a.avg_watts || null,
      calories: a.calories || null,
      url: a.url || null
    })),
    eventsCount: Array.isArray(events) ? events.length : 0
  };
}

export async function fetchIntervalsSnapshot() {
  const { oldest, newest, wellnessOldest, wellnessNewest } = getDateRange();
  const [activities, wellness] = await Promise.all([
    intervalsGet(`/athlete/0/activities?oldest=${oldest}&newest=${newest}`),
    intervalsGet(`/athlete/0/wellness?oldest=${wellnessOldest}&newest=${wellnessNewest}`).catch(() => [])
  ]);
  const snapshot = computeSnapshot({
    activities: Array.isArray(activities) ? activities : [],
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
