import { cors, fetchIntervalsSnapshot } from './_intervals-core.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors({ ok: true });
  if (req.method !== 'POST') return cors({ ok: false, error: 'Use POST' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const expected = process.env.INTERVALS_WEBHOOK_SECRET;
    if (expected && body.secret !== expected) {
      return cors({ ok: false, error: 'Unauthorized webhook secret' }, 401);
    }
    const snapshot = await fetchIntervalsSnapshot();
    return cors({ ok: true, reason: 'webhook', received: body.events?.length || 0, snapshot });
  } catch (err) {
    return cors({ ok: false, error: err.message }, 500);
  }
};
