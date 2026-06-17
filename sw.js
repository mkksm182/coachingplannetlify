const CACHE='op-coach-center-v3-autofill';
const FILES=['./','./index.html','./style.css','./app.js?v=autofill-v2','./data/plan.js','./data/structured_workouts.js','./manifest.json','./assets/icon.svg'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES).catch(()=>undefined)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(url.pathname.includes('/.netlify/functions/') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/index.html')){
    event.respondWith(fetch(req).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});return res})).catch(()=>caches.match('./index.html')));
});
