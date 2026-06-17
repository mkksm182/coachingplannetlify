import { cors, fetchIntervalsSnapshot, getCachedSnapshot } from './_intervals-core.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors({ ok: true });
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1' || req.method === 'POST';
    let snapshot = force ? null : await getCachedSnapshot();
    const staleMs = 1000 * 60 * 60 * 2;
    const isStale = !snapshot || !snapshot.syncedAt || (Date.now() - new Date(snapshot.syncedAt).getTime()) > staleMs;
    if (force || isStale) snapshot = await fetchIntervalsSnapshot();
    return cors({ ok: true, source: force ? 'live' : (isStale ? 'live' : 'cache'), snapshot });
  } catch (err) {
    return cors({ ok: false, error: err.message }, 500);
  }
};
