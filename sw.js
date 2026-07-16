const CACHE='op-coach-center-v12-cpanel-php';
const FILES=['./','./index.html','./style.css','./coach-config.js','./app.js','./local-data-transfer.js','./adaptive-coach-engine.js','./intervals-autofill-engine.js','./data/plan.js','./data/structured_workouts.js','./manifest.json','./assets/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES).catch(()=>null)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  if(url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(res=>{const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}); return res}).catch(()=>caches.match(e.request)));
});
