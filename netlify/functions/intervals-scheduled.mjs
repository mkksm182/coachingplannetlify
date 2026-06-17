import { fetchIntervalsSnapshot } from './_intervals-core.mjs';

export default async () => {
  try {
    const snapshot = await fetchIntervalsSnapshot();
    console.log('Intervals scheduled sync OK', snapshot.syncedAt, snapshot.totals?.count);
    return new Response(JSON.stringify({ ok: true, syncedAt: snapshot.syncedAt }), { status: 200 });
  } catch (err) {
    console.error('Intervals scheduled sync failed', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }
};

export const config = {
  schedule: '0 5,13,21 * * *'
};
