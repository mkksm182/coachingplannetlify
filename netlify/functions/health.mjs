export default async () => {
  const hasKey = !!process.env.INTERVALS_API_KEY;
  const oldest = process.env.INTERVALS_OLDEST_DATE || null;
  return new Response(JSON.stringify({
    ok: true,
    functions: 'online',
    hasIntervalsApiKey: hasKey,
    intervalsOldestDate: oldest,
    message: hasKey ? 'Netlify Functions widzą INTERVALS_API_KEY.' : 'Brak INTERVALS_API_KEY w Environment variables dla Functions.',
    now: new Date().toISOString()
  }, null, 2), {
    status: 200,
    headers: {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}
  });
};
