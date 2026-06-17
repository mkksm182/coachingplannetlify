
const NAV=[['dashboard','Dashboard','🏠'],['calendar','Kalendarz','📅'],['plan','Plan','🏁'],['log','Uzupełnij','✍️'],['coach','Coach Center','🧠'],['garmin','Garmin','⌚'],['backup','Backup','💾']];
const items=(window.PLAN_DATA?.items||[]).map(x=>({...x,date:new Date(x.dateISO+'T12:00:00')}));
const structuredWorkouts=(window.STRUCTURED_WORKOUTS||[]).map(x=>({...x,date:new Date(x.dateISO+'T'+(x.time||'08:00')+':00')}));
const STORAGE_KEY='op_coach_center_logs_v2';
const PREF_KEY='op_coach_center_prefs_v2';
const INTERVALS_KEY='op_coach_center_intervals_v1';
let logs=loadLogs(); let prefs=loadPrefs(); let intervalsData=loadIntervalsData(); let intervalsSyncing=false; let currentView='dashboard';
let calDate=new Date(); if(items.length){calDate=new Date(items[0].dateISO+'T12:00:00')}

function loadLogs(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(e){return {}}}
function saveLogs(){localStorage.setItem(STORAGE_KEY,JSON.stringify(logs)); renderAll(); toast('Zapisane ✅')}
function loadPrefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}catch(e){return {}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}

function loadIntervalsData(){try{return JSON.parse(localStorage.getItem(INTERVALS_KEY)||'null')}catch(e){return null}}
function saveIntervalsData(data){
  intervalsData=data;
  localStorage.setItem(INTERVALS_KEY,JSON.stringify(data||null));
  const r=autoFillLogsFromIntervals({silent:true});
  if(r.changed){localStorage.setItem(STORAGE_KEY,JSON.stringify(logs)); window.__lastAutoFill=r;}
}
function intervalsSnapshot(){return intervalsData?.snapshot||intervalsData||null}

const AUTO_FILL_VERSION='2026-06-17-v2';
function activityToSport(a){const raw=String(a.type||a.sport||a.activity_type||a.name||'').toLowerCase(); if(/run|running|treadmill|bieg/.test(raw))return 'run'; if(/ride|bike|cycling|rower|tacx|virtual|bicycle/.test(raw))return 'ride'; if(/swim|pool|pływ|plyw|open water/.test(raw))return 'swim'; if(/strength|weight|siła|sila|gym|core|prehab/.test(raw))return 'strength'; return 'other'}
function itemToSport(it){const raw=String((it.discipline||'')+' '+(it.description||'')+' '+(it.intensity||'')).toLowerCase(); if(/basen|pływ|plyw|open water|swim|kraul|css/.test(raw))return 'swim'; if(/tacx|rower|bike|ride|ftp|z1|z2|wat|watt/.test(raw))return 'ride'; if(/siła|sila|prehab|gym|core|mobilność|mobilnosc/.test(raw))return 'strength'; if(/bieg|run|maraton|rytmy|interwał|interwal|long run|easy|t2|tempo/.test(raw))return 'run'; return 'other'}
function isComboItem(it){const raw=String((it.discipline||'')+' '+(it.description||'')).toLowerCase(); return /t2|zakład|zaklad|brick|rower.*bieg|bike.*run|ride.*run|bieg.*basen|run.*swim/.test(raw)}
function activityMinutes(a){const h=num(a.hours); if(h>0)return Math.round(h*60); const secs=num(a.duration||a.elapsed_time||a.moving_time||a.total_timer_time); return secs>0?Math.round(secs/60):0}
function activityKm(a){const km=num(a.km); if(km>0)return Math.round(km*100)/100; const dist=num(a.distance||a.distance_meters); if(dist>0)return Math.round((dist>1000?dist/1000:dist)*100)/100; return 0}
function activityLoadValue(a){return Math.round(num(a.load||a.icu_training_load||a.training_load||a.tss||a.TSS))}
function plannedKm(it){const pk=num(it.plannedKm||it['Dystans km']||it.distanceKm||it.distance); if(pk>0)return pk; const m=String(it.description||'').match(/(\d+[,.]?\d*)\s*km/i); return m?num(m[1]):0}
function activityNote(a){const bits=[]; const mins=activityMinutes(a), km=activityKm(a), load=activityLoadValue(a); if(a.name)bits.push(`Intervals: ${a.name}`); if(km)bits.push(`${km} km`); if(mins)bits.push(`${mins} min`); if(load)bits.push(`Load ${load}`); if(a.avg_hr)bits.push(`HR avg ${a.avg_hr}`); if(a.avg_watts)bits.push(`W avg ${a.avg_watts}`); if(a.calories)bits.push(`${a.calories} kcal`); return bits.join(' • ')}
function dateDiffDays(a,b){return Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/86400000)}
function alreadyUsedActivityIds(){const ids=new Set(); Object.values(logs).forEach(l=>{(l?.intervalsActivities||[]).forEach(a=>ids.add(String(a.id))); if(l?.intervalsActivityId)ids.add(String(l.intervalsActivityId));}); return ids}
function scoreCandidate(it,a){const sport=activityToSport(a), itSport=itemToSport(it), txt=String((it.discipline||'')+' '+(it.description||'')).toLowerCase(); let score=0; if(it.dateISO===a.date)score+=100; else score+=60-Math.abs(dateDiffDays(it.dateISO,a.date))*10; if(itSport===sport)score+=40; if(isComboItem(it)&&(sport==='run'||sport==='ride'))score+=25; if(/t2|brick/.test(String(a.name||'').toLowerCase()) && /t2|zakład|zaklad|brick/.test(txt))score+=20; const akm=activityKm(a), pk=plannedKm(it); if(akm&&pk)score+=Math.max(0,20-Math.abs(pk-akm)*2); if(/wolne|rest|odpoczynek/i.test(it.discipline+' '+it.description))score-=200; return score}
function bestPlannedMatch(activity,usedItemHard=new Set()){
  const sport=activityToSport(activity);
  const sameDate=items.filter(it=>it.dateISO===activity.date && !isRest(it));
  let candidates=sameDate.filter(it=>itemToSport(it)===sport || isComboItem(it));
  if(!candidates.length)candidates=sameDate;
  if(!candidates.length){
    candidates=items.filter(it=>!isRest(it) && Math.abs(dateDiffDays(it.dateISO,activity.date))<=1 && (itemToSport(it)===sport || isComboItem(it)));
  }
  candidates=candidates.filter(it=>!usedItemHard.has(it.id) || isComboItem(it) || (logs[it.id]?.intervalsActivities||[]).length);
  if(!candidates.length)return null;
  candidates=candidates.map(it=>({it,score:scoreCandidate(it,activity)})).sort((a,b)=>b.score-a.score);
  return candidates[0].score>0?candidates[0].it:null;
}
function normalizeActivityForLog(a){return {id:String(a.id||`${a.date}-${a.type}-${a.name}`),date:a.date||'',type:a.type||'',sport:activityToSport(a),name:a.name||'Intervals activity',minutes:activityMinutes(a),km:activityKm(a),load:activityLoadValue(a),avg_hr:a.avg_hr||null,avg_watts:a.avg_watts||null,calories:a.calories||null,source:'Intervals.icu'}}
function recomputeLogFromActivities(log,it){const arr=log.intervalsActivities||[]; const sum=(k)=>arr.reduce((s,a)=>s+num(a[k]),0); const mins=Math.round(sum('minutes')), km=Math.round(sum('km')*100)/100, load=Math.round(sum('load')); if(mins)log.time=String(mins); if(km)log.km=String(km); const pk=plannedKm(it); if(pk&&km)log.done=String(Math.min(130,Math.round(km/pk*100))); else log.done=log.done||'100'; log.status='Intervals auto'; const names=arr.map(a=>`${a.date} ${a.sport}: ${a.name} (${a.km||0} km, ${a.minutes||0} min${a.load?`, load ${a.load}`:''})`); const manual=String(log.notes||'').split('
').filter(line=>!line.startsWith('AUTO Intervals:')).join('
').trim(); log.notes=[manual, ...names.map(x=>'AUTO Intervals: '+x)].filter(Boolean).join('
'); log.intervalsActivityId=arr.map(a=>a.id).join(','); log.intervalsSyncedAt=new Date().toISOString(); log.updated=new Date().toISOString(); return log}
function autoFillLogsFromIntervals(opts={}){
  const snap=intervalsSnapshot(); const acts=(snap?.activities||[]).slice().filter(a=>a&&a.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!acts.length)return {created:0,updated:0,matched:0,changed:0,skipped:0,message:'Brak aktywności z Intervals w snapshotcie.'};
  const usedActivities=alreadyUsedActivityIds(); const usedItemsHard=new Set(); let created=0,updated=0,matched=0,skipped=0;
  for(const raw of acts){const a={...raw,id:String(raw.id||`${raw.date}-${raw.type}-${raw.name}`)}; if(usedActivities.has(String(a.id))){skipped++; continue;} const it=bestPlannedMatch(a,usedItemsHard); if(!it){skipped++; continue;} const before=!!logs[it.id]; const log={...(logs[it.id]||{})}; const arr=(log.intervalsActivities||[]).slice(); arr.push(normalizeActivityForLog(a)); log.intervalsActivities=arr; logs[it.id]=recomputeLogFromActivities(log,it); usedActivities.add(String(a.id)); if(!isComboItem(it))usedItemsHard.add(it.id); matched++; if(before)updated++; else created++; }
  const changed=created+updated; const result={created,updated,matched,changed,skipped,version:AUTO_FILL_VERSION,message:`Auto-fill: ${changed} wpisów, dopasowano ${matched}, pominięto ${skipped}.`}; window.__lastAutoFill=result; if(!opts.silent)toast(result.message); return result;
}
function forceAutoFillFromIntervals(){const r=autoFillLogsFromIntervals({silent:false}); if(r.changed){localStorage.setItem(STORAGE_KEY,JSON.stringify(logs)); renderAll();} return r}
function autoFillBadge(){const r=window.__lastAutoFill; if(!r)return ''; return `<span class="pill green">auto-fill ${esc(r.changed||0)}</span>`}
function hoursAgo(iso){if(!iso)return '—';const h=(Date.now()-new Date(iso).getTime())/36e5; if(h<1)return Math.max(1,Math.round(h*60))+' min temu'; if(h<48)return Math.round(h)+' h temu'; return Math.round(h/24)+' dni temu'}
async function syncIntervals(force=false){
  if(intervalsSyncing)return; intervalsSyncing=true; updateIntervalsButtons(true);
  try{
    const res=await fetch('/.netlify/functions/intervals-sync'+(force?'?force=1':''),{method:force?'POST':'GET'});
    const data=await res.json();
    if(!res.ok||!data.ok)throw new Error(data.error||'Błąd synchronizacji Intervals.icu');
    saveIntervalsData(data.snapshot?data:{snapshot:data});
    const af=window.__lastAutoFill;
    toast((force?'Intervals: zsynchronizowano live ✅':'Intervals: dane odświeżone ✅')+(af?` • ${af.message}`:''));
    renderAll();
  }catch(err){toast('Intervals: '+err.message); console.error(err)}
  finally{intervalsSyncing=false; updateIntervalsButtons(false)}
}
function updateIntervalsButtons(busy){document.querySelectorAll('[data-intervals-sync]').forEach(b=>{b.disabled=busy;b.textContent=busy?'Synchronizuję…':'Synchronizuj teraz'})}
function intervalsPanel(){
  const snap=intervalsSnapshot();
  if(!snap)return `<div class="section-title"><div><h3>Intervals.icu live sync</h3><p>Połączone przez Netlify Functions. Dane będą pobierane 3× dziennie i ręcznie na klik.</p></div><button class="btn primary" data-intervals-sync onclick="syncIntervals(true)">Synchronizuj teraz</button></div><div class="card"><p style="color:var(--muted);line-height:1.6">Brak pobranego snapshotu. Po wdrożeniu na Netlify ustaw zmienną <code>INTERVALS_API_KEY</code>, kliknij synchronizację, a aplikacja automatycznie dopasuje wykonane aktywności do planu.</p></div>`;
  const t=snap.totals||{}, l7=snap.last7||{}, l30=snap.last30||{}, w=snap.wellness||{};
  return `<div class="section-title"><div><h3>Intervals.icu live sync</h3><p>Ostatnia synchronizacja: ${esc(hoursAgo(snap.syncedAt))} • ostatnia aktywność: ${esc(t.lastActivityDate||'—')} ${autoFillBadge()}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-intervals-sync onclick="syncIntervals(true)">Synchronizuj teraz</button><button class="btn" onclick="forceAutoFillFromIntervals()">Dopasuj do planu</button></div></div>
  <div class="grid cols-4">
    ${metric('Aktywności 7 dni',l7.count||0,`${(l7.hours||0).toFixed?l7.hours.toFixed(1):l7.hours||0} h • ${l7.km||0} km`)}
    ${metric('Load 7 dni',l7.load||0,'z Intervals.icu')}
    ${metric('Aktywności 30 dni',l30.count||0,`${l30.hours||0} h • ${l30.km||0} km`)}
    ${metric('Sen / HRV',`${w.avgSleep||'—'} / ${w.avgHRV||'—'}`,'średnia wellness 14 dni')}
  </div>`
}
function intervalsCoachPanel(){
  const snap=intervalsSnapshot(); if(!snap)return '<div class="card"><h3>Intervals.icu</h3><p style="color:var(--muted)">Brak danych live. Zsynchronizuj po wdrożeniu na Netlify.</p></div>';
  const acts=snap.activities||[];
  return `<div class="card"><h3 style="margin-top:0">Ostatnie aktywności z Intervals.icu</h3>${acts.length?`<table class="table"><thead><tr><th>Data</th><th>Typ</th><th>Nazwa</th><th>Km</th><th>h</th><th>Load</th></tr></thead><tbody>${acts.slice(0,8).map(a=>`<tr><td>${esc(a.date||'')}</td><td>${esc(a.type||'')}</td><td>${esc(a.name||'')}</td><td>${esc(a.km||0)}</td><td>${esc(a.hours||0)}</td><td>${esc(a.load||0)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Brak aktywności w pobranym zakresie.</div>'}</div>`;
}
function $(id){return document.getElementById(id)}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmtDate(d){return new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'short',year:'numeric'}).format(d)}
function iso(d){return d.toISOString().slice(0,10)}
function monthName(d){return new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(d)}
function todayIso(){return iso(new Date())}
function isRest(it){return /WOLNE|REGENERACJA/i.test((it.discipline||'')+' '+(it.intensity||''))}
function num(v){let n=parseFloat(String(v||'').replace(',','.'));return isFinite(n)?n:0}
function getLog(id){return logs[id]||{}}
function merged(it){return {...it,...getLog(it.id)}}
function findTodayPlan(){const t=todayIso(); return items.find(x=>x.dateISO===t)||nextWorkout()}
function nextWorkout(){const now=new Date(); return items.find(x=>x.date>=new Date(now.toDateString()))||items[items.length-1]}
function loggedItems(days=9999){const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-days+1); return items.map(merged).filter(x=>logs[x.id] && x.date>=cutoff)}
function avg(arr,field){const vals=arr.map(x=>num(x[field])).filter(x=>x>0); return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : 0}
function countCond(arr,fn){return arr.filter(fn).length}
function readiness(){
  const l7=loggedItems(7), l14=loggedItems(14);
  const rpe=avg(l7,'rpe'), pain=avg(l7,'pain'), sleep=avg(l7,'sleep'), mental=avg(l7,'mental');
  const pain3=countCond(l14,x=>num(x.pain)>=3), pain5=countCond(l14,x=>num(x.pain)>=5);
  let score=88;
  if(rpe>0) score-=Math.max(0,(rpe-4.5)*7);
  if(pain>0) score-=pain*6;
  if(sleep>0) score-=Math.max(0,(6.8-sleep)*8);
  if(mental>0) score-=Math.max(0,(6-mental)*5);
  score-=pain3*3+pain5*8;
  score=Math.max(15,Math.min(100,Math.round(score)));
  if(!l7.length) return {score:null,label:'BRAK DANYCH',class:'warn',comment:'Uzupełnij kilka treningów, żeby panel zaczął liczyć realną gotowość.',rpe,pain,sleep,mental,pain3,pain5};
  let label='ZIELONY'; let cls='good'; let comment='Petarda: regeneracja wygląda dobrze. Realizuj plan, ale bez dokładania.';
  if(score<75){label='ŻÓŁTY';cls='warn';comment='Kontynuuj, ale skróć akcent lub pilnuj RPE. Zero dokładania.'}
  if(score<60){label='POMARAŃCZOWY';cls='warn';comment='Zamień mocny trening na easy / basen / Z1-Z2. Priorytet: sen i tkanki.'}
  if(score<45){label='CZERWONY';cls='bad';comment='Stop dla mocnych bodźców. Wolne albo regeneracja. Jeśli ból rośnie — fizjo/lekarz.'}
  return {score,label,class:cls,comment,rpe,pain,sleep,mental,pain3,pain5};
}
function planBFor(it,rd=readiness()){
  if(!it) return 'Brak treningu w planie.';
  if(rd.score===null) return 'Realizuj plan, ale wpisz RPE/ból/sen po treningu.';
  const disc=(it.discipline||'').toLowerCase(), desc=it.description||'';
  if(rd.score>=75) return 'Realizuj plan. Nie dokładaj ekstra.';
  if(/start|test/i.test(desc+' '+disc)) return rd.score<60?'Przenieś test albo zrób tylko rozgrzewkę + easy.':'Zrób test kontrolnie, bez walki o rekord.';
  if(/long|długi|bieg/i.test(disc+' '+desc) && /bieg/i.test(disc+' '+desc)) return rd.score<60?'Skróć do 50-65% dystansu, tylko easy.':'Skróć o 20-30%, bez bloków race pace.';
  if(/tacx|rower|bike/i.test(disc+' '+desc)) return rd.score<60?'45-60 min Z1/Z2, bez T2.':'Zostaw Z2, usuń sweet spot / race pace / T2.';
  if(/basen|pływ|open water/i.test(disc+' '+desc)) return rd.score<60?'Luźne 20-30 min technika albo wolne.':'Płyń technicznie, bez mocnych serii.';
  return rd.score<60?'Zamień na spacer, mobilność lub wolne.':'Skróć o 20-30% i trzymaj RPE nisko.';
}
function updateNav(){const navHtml=NAV.map(([id,label,ico])=>`<button class="${id===currentView?'active':''}" data-view="${id}"><span>${ico}</span><span>${label}</span></button>`).join(''); $('sideNav').innerHTML=navHtml; $('mobileNav').innerHTML=navHtml; document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));}
function showView(id){currentView=id; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(`view-${id}`).classList.add('active'); updateNav(); const titles={dashboard:['Dashboard','Centrum dowodzenia treningiem'],calendar:['Kalendarz','Każda jednostka treningowa z opisem'],plan:['Plan treningowy','Filtruj, szukaj i otwieraj szczegóły'],log:['Uzupełnij trening','Wpisy po treningu zapisują się lokalnie'],coach:['Coach Center','Readiness, Plan B, paliwo, buty i predykcja'],garmin:['Garmin sync','Eksport do Intervals.icu i kalendarza Garmin'],backup:['Backup / eksport','Przenieś dane między komputerem, telefonem i tabletem']}; $('pageTitle').textContent=titles[id][0]; $('pageSub').textContent=titles[id][1]; renderView(id);}
function renderAll(){updateNav(); ['dashboard','calendar','plan','log','coach','garmin','backup'].forEach(renderView); const rd=readiness(); $('sideScore').textContent=rd.score??'—'; $('sideRing').style.setProperty('--p', (rd.score??0)+'%'); $('sideComment').textContent=rd.comment;}
function renderView(id){const fn={dashboard:renderDashboard,calendar:renderCalendar,plan:renderPlan,log:renderLog,coach:renderCoach,garmin:renderGarmin,backup:renderBackup}[id]; if(fn) fn();}
function metric(label,value,hint,cls=''){return `<div class="card metric ${cls}"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`}
function renderDashboard(){const rd=readiness(); const today=findTodayPlan(); const next=nextWorkout(); const done=Object.keys(logs).length; const total=items.length; const compl=Math.round(done/total*100);
  $('view-dashboard').innerHTML=`
  <div class="grid cols-4">
    ${metric('Readiness', rd.score===null?'—':rd.score+'/100', rd.label||'uzupełnij dane', rd.class)}
    ${metric('Wpisy', done, `z ${total} jednostek (${compl}%)`)}
    ${metric('Śr. RPE 7 dni', rd.rpe?rd.rpe.toFixed(1):'—', 'odczuwalna ciężkość')}
    ${metric('Śr. sen 7 dni', rd.sleep?rd.sleep.toFixed(1)+' h':'—', 'regeneracja')}
  </div>
  ${intervalsPanel()}
  <div class="section-title"><div><h3>Najbliższy trening</h3><p>Plan + automatyczny Plan B wg aktualnej gotowości</p></div><span class="pill ${rd.class||''}">${rd.label||'BRAK DANYCH'}</span></div>
  <div class="grid cols-2"><div class="card">${workoutFull(today,true)}</div><div class="card"><h3 style="margin-top:0">Coach comment</h3><p style="color:var(--muted);line-height:1.55">${esc(rd.comment)}</p><div class="detail-item"><b>Plan B</b><p>${esc(planBFor(today,rd))}</p></div></div></div>
  <div class="section-title"><div><h3>Ten tydzień</h3><p>Podgląd jednostek w najbliższych 7 dniach</p></div></div>
  <div class="list">${items.filter(x=>{let d=new Date();let e=new Date();e.setDate(e.getDate()+7);return x.date>=new Date(d.toDateString())&&x.date<=e}).map(workoutRow).join('')||'<div class="empty">Brak nadchodzących treningów.</div>'}</div>`;
}
function workoutFull(it,button=false){if(!it)return '<div class="empty">Brak jednostki.</div>'; const l=getLog(it.id); return `<div class="tagline"><span class="pill green">${esc(it.Phase)}</span><span class="pill">${esc(it.intensity)}</span><span class="pill">${esc(it.week)}</span></div><h3 style="margin:12px 0 4px">${esc(it.discipline)}</h3><p style="color:var(--muted);margin:0 0 12px">${fmtDate(it.date)} • ${esc(it['Dzień']||'')}</p><p style="line-height:1.55">${esc(it.description)}</p><div class="detail-grid"><div class="detail-item"><b>Cel</b><p>${esc(it.goal)}</p></div><div class="detail-item"><b>Żywienie</b><p>${esc(it.breakfast)} ${esc(it.lunch)} ${esc(it.dinner)}</p></div></div>${l.rpe?`<div class="tagline"><span class="pill green">RPE ${l.rpe}</span><span class="pill">ból ${l.pain||0}</span><span class="pill">sen ${l.sleep||'—'}h</span></div>`:''}${button?`<div style="margin-top:14px"><button class="btn primary" onclick="prefillLog('${it.id}')">Uzupełnij ten trening</button> <button class="btn" onclick="openWorkout('${it.id}')">Szczegóły</button></div>`:''}`}
function workoutRow(it){return `<div class="workout-row" onclick="openWorkout('${it.id}')"><div class="datebox">${fmtDate(it.date)}<small>${esc(it['Dzień']||'')}</small></div><div><h4>${esc(it.discipline)}</h4><p>${esc(it.description)}</p><div class="tagline"><span class="pill">${esc(it.intensity)}</span><span class="pill">${esc(it.week)}</span>${logs[it.id]?'<span class="pill green">uzupełnione</span>':''}${logs[it.id]?.intervalsActivityId?'<span class="pill">Intervals auto</span>':''}</div></div><button class="btn" onclick="event.stopPropagation();prefillLog('${it.id}')">Wpisz</button></div>`}
function renderCalendar(){const y=calDate.getFullYear(), m=calDate.getMonth(); const first=new Date(y,m,1); const start=new Date(first); const offset=(first.getDay()+6)%7; start.setDate(first.getDate()-offset); const days=[]; for(let i=0;i<42;i++){let d=new Date(start);d.setDate(start.getDate()+i);days.push(d)}
 const monthItems=items.filter(x=>x.date.getFullYear()===y&&x.date.getMonth()===m);
 $('view-calendar').innerHTML=`<div class="card"><div class="calendar-head"><button class="btn" id="prevMonth">←</button><h3>${monthName(calDate)}</h3><button class="btn" id="nextMonth">→</button></div><div class="toolbar"><button class="btn" id="todayMonth">Dzisiaj</button><select id="monthJump">${[...new Set(items.map(x=>x.monthKey))].map(k=>{let [yy,mm]=k.split('-').map(Number);return `<option value="${k}" ${yy===y&&mm-1===m?'selected':''}>${monthName(new Date(yy,mm-1,1))}</option>`}).join('')}</select></div><div class="calendar-grid">${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'].map(d=>`<div class="dow">${d}</div>`).join('')}${days.map(d=>calendarDay(d,m)).join('')}</div></div><div class="section-title"><div><h3>Lista miesiąca</h3><p>${monthItems.length} jednostek</p></div></div><div class="list">${monthItems.map(workoutRow).join('')}</div>`;
 $('prevMonth').onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()}; $('nextMonth').onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()}; $('todayMonth').onclick=()=>{calDate=new Date();renderCalendar()}; $('monthJump').onchange=e=>{const [yy,mm]=e.target.value.split('-').map(Number);calDate=new Date(yy,mm-1,1);renderCalendar()};}
function calendarDay(d,curM){const ds=iso(d); const dayItems=items.filter(x=>x.dateISO===ds); const today=ds===todayIso(); return `<div class="day ${d.getMonth()!==curM?'off':''} ${today?'today':''}"><div class="day-num"><span>${d.getDate()}</span>${logsForDate(ds).length?'<span class="pill green">✓</span>':''}</div>${dayItems.slice(0,3).map(x=>`<div class="event ${eventClass(x)}" onclick="openWorkout('${x.id}')"><div class="e-title">${esc(x.discipline)}</div><div class="e-meta">${esc(x.intensity)}</div></div>`).join('')}${dayItems.length>3?`<div class="pill">+${dayItems.length-3}</div>`:''}</div>`}
function eventClass(x){let s=((x.intensity||'')+' '+(x.discipline||'')).toUpperCase(); if(/LONG/.test(s))return 'LONG'; if(/START|TEST|MOCNY|INTERWA/.test(s))return 'MOCNY'; if(/BASEN|OPEN/.test(s))return 'BASEN'; if(/TACX|ROWER/.test(s))return 'TACX'; if(/WOLNE|REGENER/.test(s))return 'REGENERACJA'; return ''}
function logsForDate(ds){return Object.entries(logs).filter(([id])=>items.find(x=>x.id===id)?.dateISO===ds)}
function renderPlan(){const phases=[...new Set(items.map(x=>x.Phase))]; const intens=[...new Set(items.map(x=>x.intensity).filter(Boolean))]; $('view-plan').innerHTML=`<div class="toolbar"><div class="search"><input class="input" id="planSearch" placeholder="Szukaj: rytmy, long, Tacx, CSS..." /></div><select id="phaseFilter"><option value="">Wszystkie fazy</option>${phases.map(p=>`<option>${esc(p)}</option>`).join('')}</select><select id="intFilter"><option value="">Każda intensywność</option>${intens.map(p=>`<option>${esc(p)}</option>`).join('')}</select></div><div class="list" id="planList"></div>`; const update=()=>{let q=$('planSearch').value.toLowerCase(), ph=$('phaseFilter').value, itf=$('intFilter').value; let arr=items.filter(x=>(!ph||x.Phase===ph)&&(!itf||x.intensity===itf)&&(!q||JSON.stringify(x).toLowerCase().includes(q))); $('planList').innerHTML=arr.slice(0,300).map(workoutRow).join('')+(arr.length>300?`<div class="empty">Pokazuję 300 z ${arr.length}. Zawęź wyszukiwanie.</div>`:'')||'<div class="empty">Brak wyników.</div>'}; ['planSearch','phaseFilter','intFilter'].forEach(id=>setTimeout(()=>$(id).oninput=update)); update();}
function renderLog(){const opts=items.map(x=>`<option value="${x.id}">${x.dateISO} • ${x.discipline} • ${x.week}</option>`).join(''); $('view-log').innerHTML=`<div class="card"><h3 style="margin-top:0">Wpis po treningu</h3><p style="color:var(--muted);margin-top:-4px">Auto-fill z Intervals działa w tle. Możesz też kliknąć: <button class="btn" type="button" onclick="forceAutoFillFromIntervals()">Dopasuj wykonane aktywności teraz</button></p><div class="form-grid"><div class="full"><label>Jednostka treningowa</label><select id="logWorkout">${opts}</select></div><div><label>RPE 1-10</label><input id="logRpe" class="input" type="number" min="1" max="10" step="1"></div><div><label>Ból 0-10</label><input id="logPain" class="input" type="number" min="0" max="10" step="1"></div><div><label>Sen (h)</label><input id="logSleep" class="input" type="number" min="0" step="0.1"></div><div><label>Mental 1-10</label><input id="logMental" class="input" type="number" min="1" max="10" step="1"></div><div><label>Czas min</label><input id="logTime" class="input" type="number" min="0"></div><div><label>Dystans km</label><input id="logKm" class="input" type="number" min="0" step="0.1"></div><div><label>Buty / sprzęt</label><input id="logShoes" class="input" placeholder="np. Metaspeed / Tacx / pianka"></div><div><label>Plan wykonany %</label><input id="logDone" class="input" type="number" min="0" max="130" value="100"></div><div class="wide"><label>Paliwo / żele</label><input id="logFuel" class="input" placeholder="np. 3 żele, 750 ml, sód"></div><div class="wide"><label>Status</label><select id="logStatus"><option>OK</option><option>Ciężko</option><option>Skrócone</option><option>Pominięte</option><option>Ból</option></select></div><div class="full"><label>Uwagi</label><textarea id="logNotes" placeholder="Jak weszło, co bolało, co zadziałało, co poprawić?"></textarea></div></div><div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="saveLog">Zapisz wpis</button><button class="btn warn" id="deleteLog">Usuń wpis dla tej jednostki</button></div></div><div class="section-title"><div><h3>Ostatnie wpisy</h3><p>Twoje najnowsze dane po treningach</p></div></div><div class="list" id="recentLogs"></div>`; $('logWorkout').onchange=loadLogForm; $('saveLog').onclick=saveLogForm; $('deleteLog').onclick=deleteLogForm; const next=findTodayPlan(); $('logWorkout').value=next?.id||items[0]?.id; loadLogForm(); renderRecentLogs();}
function loadLogForm(){const id=$('logWorkout').value; const l=logs[id]||{}; const map={logRpe:'rpe',logPain:'pain',logSleep:'sleep',logMental:'mental',logTime:'time',logKm:'km',logShoes:'shoes',logDone:'done',logFuel:'fuel',logStatus:'status',logNotes:'notes'}; Object.entries(map).forEach(([el,k])=>{$(el).value=l[k]|| (k==='done'?'100':'')});}
function saveLogForm(){const id=$('logWorkout').value; logs[id]={rpe:$('logRpe').value,pain:$('logPain').value,sleep:$('logSleep').value,mental:$('logMental').value,time:$('logTime').value,km:$('logKm').value,shoes:$('logShoes').value,done:$('logDone').value,fuel:$('logFuel').value,status:$('logStatus').value,notes:$('logNotes').value,updated:new Date().toISOString()}; saveLogs();}
function deleteLogForm(){const id=$('logWorkout').value; delete logs[id]; saveLogs(); loadLogForm();}
function renderRecentLogs(){const arr=Object.keys(logs).map(id=>items.find(x=>x.id===id)).filter(Boolean).sort((a,b)=>b.date-a.date).slice(0,12); const el=$('recentLogs'); if(el) el.innerHTML=arr.map(workoutRow).join('')||'<div class="empty">Jeszcze brak wpisów.</div>'}
function prefillLog(id){showView('log'); setTimeout(()=>{$('logWorkout').value=id; loadLogForm(); window.scrollTo({top:0,behavior:'smooth'})},0)}
function renderCoach(){const rd=readiness(); const shoeRows=shoeStats(); const next=findTodayPlan(); $('view-coach').innerHTML=`<div class="grid cols-3">${metric('Readiness',rd.score===null?'—':rd.score+'/100',rd.label||'brak danych',rd.class)}${metric('Ból ≥3 / 14 dni',rd.pain3,'sygnały przeciążenia',rd.pain3>2?'bad':'')}${metric('Mental 7 dni',rd.mental?rd.mental.toFixed(1):'—','głowa / motywacja')}</div>${intervalsCoachPanel()}<div class="section-title"><div><h3>Automatyczny Plan B</h3><p>Dla najbliższej jednostki</p></div></div><div class="card"><div class="detail-grid"><div class="detail-item"><b>Plan</b><p>${esc(next?.discipline)} — ${esc(next?.description)}</p></div><div class="detail-item"><b>Plan B</b><p>${esc(planBFor(next,rd))}</p></div></div></div><div class="section-title"><div><h3>Kalkulator paliwa</h3><p>Dla long runów, zakładek i startów</p></div></div><div class="card"><div class="form-grid"><div><label>Czas treningu (min)</label><input class="input" id="fuelMin" type="number" value="180"></div><div><label>Węgle g/h</label><input class="input" id="fuelCarb" type="number" value="70"></div><div><label>Żel g węgli</label><input class="input" id="fuelGel" type="number" value="25"></div><div><label>Płyn ml/h</label><input class="input" id="fuelFluid" type="number" value="600"></div></div><div id="fuelResult" style="margin-top:14px"></div></div><div class="section-title"><div><h3>Buty / sprzęt</h3><p>Liczone z Twoich wpisów dystansu i pola Buty/sprzęt</p></div></div><div class="card">${shoeRows.length?`<table class="table"><thead><tr><th>Sprzęt</th><th>Km</th><th>Status</th></tr></thead><tbody>${shoeRows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.km.toFixed(1)}</td><td>${r.km>650?'Wymiana / ostrożnie':r.km>450?'Obserwuj':'OK'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Wpisz buty/sprzęt i dystans po biegach, a tracker zacznie liczyć przebieg.</div>'}</div><div class="section-title"><div><h3>Predykcja startów</h3><p>Orientacyjnie — na podstawie wpisanych testów</p></div></div><div class="grid cols-2"><div class="card"><h3>Oslo Marathon</h3><p style="color:var(--muted)">${racePredictor('oslo')}</p></div><div class="card"><h3>Ironman 70.3 Poznań</h3><p style="color:var(--muted)">${racePredictor('im')}</p></div></div>`; ['fuelMin','fuelCarb','fuelGel','fuelFluid'].forEach(id=>setTimeout(()=>$(id).oninput=calcFuel)); calcFuel();}
function calcFuel(){const min=num($('fuelMin')?.value), carb=num($('fuelCarb')?.value), gel=num($('fuelGel')?.value)||25, fluid=num($('fuelFluid')?.value); if(!$('fuelResult')) return; const hours=min/60, total=hours*carb, gels=Math.ceil(total/gel), fl=hours*fluid; $('fuelResult').innerHTML=`<div class="grid cols-4">${metric('Węgle razem',Math.round(total)+' g',`${carb} g/h`)}${metric('Żele',gels,`${gel} g/żel`)}${metric('Płyn',Math.round(fl)+' ml',`${fluid} ml/h`)}${metric('Harmonogram',min?`co ${Math.max(20,Math.round(min/gels))} min`:'—','orientacyjnie')}</div>`}
function shoeStats(){const map={}; Object.entries(logs).forEach(([id,l])=>{if(!l.shoes)return; const km=num(l.km); if(!km)return; l.shoes.split(/[,+;/]/).map(s=>s.trim()).filter(Boolean).forEach(s=>map[s]=(map[s]||0)+km)}); return Object.entries(map).map(([name,km])=>({name,km})).sort((a,b)=>b.km-a.km)}
function racePredictor(kind){const arr=Object.keys(logs).map(id=>merged(items.find(x=>x.id===id)||{})).filter(x=>x.id); if(!arr.length)return 'Brak danych. Uzupełnij testy i jednostki kluczowe.'; if(kind==='oslo'){const hm=arr.find(x=>/półmaraton|21,1|21.1/i.test(x.description||'')); const ten=arr.find(x=>/10 km|10km/i.test(x.description||'')); return hm?'Masz wpisany test półmaratoński — użyj jego wyniku/RPE do kalibracji tempa 4:58/km.':'Po teście 10 km i HM aplikacja pokaże bardziej sensowną predykcję. Na razie trzymaj strategię 5:00→4:58/km.'} return 'Dla 70.3 predykcja będzie sensowna po wpisaniu symulacji: open water + rower + T2 oraz treningu 1900 m non-stop.'}

function disciplineType(it){const t=((it.discipline||'')+' '+(it.description||'')).toLowerCase(); if(/wolne|rest/.test(t)) return 'note'; if(/tacx|rower|bike|ftp|z2|z1/.test(t)) return 'ride'; if(/basen|pływ|plyw|open water|kraul|css/.test(t)) return 'swim'; if(/sił|sil|prehab|mobil/.test(t)) return 'strength'; if(/bieg|run|long|maraton|rytmy|interwał|interwal/.test(t)) return 'run'; return 'workout'}
function icsEscape(s){return String(s??'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function ymd(dateISO){return String(dateISO).replace(/-/g,'')}
function foldLine(line){let out=''; while(line.length>73){out+=line.slice(0,73)+'\r\n '; line=line.slice(73)} return out+line}
function addIcsLine(lines,line){lines.push(foldLine(line))}
function workoutBuilderText(it){const type=disciplineType(it); const d=(it.description||'').toLowerCase(); const minutes=num(it.plannedMinutes)||60; if(type==='run'){
  if(/rytmy/.test(d)) return '10m easy warmup\n6x 20s fast relaxed, 90s easy\n10m easy cooldown';
  let m=d.match(/(\d+)\s*[x×]\s*(\d+)\s*km/); if(m) return `15m easy warmup\n${m[1]}x ${m[2]}km hard controlled, 2m easy\n10m easy cooldown`;
  m=d.match(/(\d+)\s*[x×]\s*(\d+)\s*m/); if(m) return `15m easy warmup\n${m[1]}x ${m[2]}m hard controlled, 90s easy\n10m easy cooldown`;
  if(/test|start|półmaraton|polmaraton|21/.test(d)) return '15m easy warmup\nRace/test effort as planned\n10m easy cooldown';
  return `${Math.max(30,minutes)}m easy Z2`;
 }
 if(type==='ride'){
  if(/ftp|test/.test(d)) return '20m warmup\n20m FTP test\n10m cooldown';
  if(/sweet spot|race pace/.test(d)) return `10m Z1 warmup\n${Math.max(30,minutes-20)}m Z2 with planned quality blocks\n10m cooldown`;
  return `${Math.max(30,minutes)}m Z1-Z2`;
 }
 if(type==='swim'){
  if(/1900/.test(d)) return '1900m continuous swim rehearsal';
  if(/css/.test(d)) return 'Warmup\nCSS intervals as planned\nCooldown';
  return 'Easy technique swim as planned';
 }
 if(type==='strength') return 'Strength/prehab session as described in notes';
 return it.description||'Workout as planned';
}
function icsDescription(it){return ['PLAN Z COACH CENTER',`Typ: ${disciplineType(it)}`,`Faza: ${it.Phase||''}`,`Tydzień: ${it.week||''}`,`Intensywność: ${it.intensity||''}`,`Cel: ${it.goal||''}`,'',`Opis: ${it.description||''}`,'',`Plan B: ${it.modification||''}`,'',`Fueling: ${it.breakfast||''} / ${it.dinner||''}`,'','INTERVALS WORKOUT BUILDER:',workoutBuilderText(it)].join('\n')}

function buildStructuredICS(includeNotes=false){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Oslo Poznan Coach Center Structured//PL','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Oslo → Poznań Coach Center Structured Garmin']; const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''); (structuredWorkouts.length?structuredWorkouts:items.map(it=>({id:'fallback-'+it.id,dateISO:it.dateISO,time:'08:00',title:it.discipline,type:disciplineType(it),category:disciplineType(it)==='note'?'NOTE':'WORKOUT',description:icsDescription(it)}))).forEach(ev=>{if(ev.category==='NOTE'&&!includeNotes)return; const start=new Date(ev.dateISO+'T'+(ev.time||'08:00')+':00'); const end=new Date(start); end.setMinutes(end.getMinutes()+garminDuration(ev)); addIcsLine(lines,'BEGIN:VEVENT'); addIcsLine(lines,'UID:'+icsEscape(ev.id+'@coach-center.local')); addIcsLine(lines,'DTSTAMP:'+now); addIcsLine(lines,'DTSTART;TZID=Europe/Oslo:'+dateTimeIcs(start)); addIcsLine(lines,'DTEND;TZID=Europe/Oslo:'+dateTimeIcs(end)); addIcsLine(lines,'SUMMARY:'+icsEscape(ev.title||'Trening')); addIcsLine(lines,'CATEGORIES:'+icsEscape(ev.type||'Workout')); addIcsLine(lines,'DESCRIPTION:'+icsEscape(ev.description||'')); addIcsLine(lines,'END:VEVENT')}); lines.push('END:VCALENDAR'); return lines.join('\r\n')}
function dateTimeIcs(d){const pad=n=>String(n).padStart(2,'0'); return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())}
function garminDuration(ev){if(ev.type==='Run')return 75;if(ev.type==='Ride')return 120;if(ev.type==='Swim')return 45;if(ev.type==='Other')return 45;return 15}
function buildICS(mode='structured'){return mode==='all'?buildStructuredICS(true):buildStructuredICS(false)}
function buildIntervalsPayload(){return (structuredWorkouts.length?structuredWorkouts:[]).map(ev=>{const o={category:ev.category||'WORKOUT',start_date_local:ev.dateISO+'T'+(ev.time||'08:00')+':00',name:ev.title||'Trening',description:ev.description||'',external_id:ev.id}; if(ev.category!=='NOTE') o.type=ev.type||'Workout'; return o})}
function copyText(text){navigator.clipboard?.writeText(text).then(()=>toast('Skopiowane ✅')).catch(()=>toast('Nie udało się skopiować'))}
function renderGarmin(){const counts=(structuredWorkouts.length?structuredWorkouts:[]).reduce((m,ev)=>{const t=ev.type||'NOTE'; m[t]=(m[t]||0)+1; return m},{}); const workoutCount=(structuredWorkouts||[]).filter(x=>x.category==='WORKOUT').length; const noteCount=(structuredWorkouts||[]).filter(x=>x.category==='NOTE').length; const hostUrl=(prefs.hostUrl||''); const apiUrl='https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true'; const curl=`curl -u API_KEY: -H "Content-Type: application/json" -X POST "${apiUrl}" --data-binary @intervals_payload.json`; $('view-garmin').innerHTML=`
  <div class="section-title"><div><h3>Garmin — szczegółowe treningi na zegarku</h3><p>Ta wersja nie wrzuca tylko opisów. Biegi, rowery, baseny i zakładki są rozpisane jako workout builder text dla Intervals.icu.</p></div><span class="pill good">${workoutCount} structured</span></div>
  <div class="grid cols-4">${metric('Run',counts.Run||0,'osobne treningi biegowe')}${metric('Ride',counts.Ride||0,'rower/Tacx/FTP')}${metric('Swim',counts.Swim||0,'basen/open water')}${metric('Notes',noteCount,'wolne/logistyka')}</div>
  <div class="card"><h3 style="margin-top:0">Najpewniejsza ścieżka</h3><ol class="steps"><li>Intervals.icu → Settings → połącz Garmin Connect.</li><li>Włącz opcję <b>Upload planned workouts</b>.</li><li>Wgraj <b>intervals_payload.json</b> przez API albo użyj <b>plan_intervals.ics</b> jako kalendarza.</li><li>Zsynchronizuj zegarek. Garmin dostaje najbliższe planowane treningi jako structured workouts.</li></ol><div class="button-row"><button class="btn primary" id="dlPayload">Pobierz structured payload JSON</button><button class="btn" id="dlIntervalsIcs">Pobierz structured ICS</button><button class="btn" id="dlGoogleIcs">Pobierz zwykły kalendarz</button></div></div>
  <div class="grid cols-2"><div class="card"><h3 style="margin-top:0">Adres po wrzuceniu na hosting</h3><p style="color:var(--muted)">Dla Intervals.icu jako external calendar użyj tego URL.</p><input class="input" id="hostUrl" placeholder="np. https://twoj-plan.netlify.app" value="${esc(hostUrl)}"><div class="detail-item" style="margin-top:12px"><b>URL structured ICS</b><p><code id="icsUrl">${esc(hostUrl?hostUrl.replace(/\/$/,'')+'/garmin/plan_intervals.ics':'Najpierw wpisz URL hostingu')}</code></p></div><button class="btn" id="copyIcsUrl">Kopiuj URL</button></div>
  <div class="card"><h3 style="margin-top:0">API Intervals.icu</h3><p style="color:var(--muted)">Najbardziej szczegółowa opcja. Payload ma pole <code>description</code> z native workout text: kroki, powtórzenia, tempo/power/cadence.</p><div class="button-row"><button class="btn primary" id="dlPayload2">Pobierz intervals_payload.json</button><button class="btn" id="copyCurl">Kopiuj curl</button></div></div></div>
  <div class="card"><h3 style="margin-top:0">Jak są rozbite treningi?</h3><table class="table"><tbody><tr><td><b>Rower długi + T2</b></td><td>Dwa treningi tego samego dnia: Ride + Run T2, żeby Garmin miał właściwy sport.</td></tr><tr><td><b>Bieg + Basen</b></td><td>Dwa treningi: Run rano + Swim wieczorem.</td></tr><tr><td><b>Interwały/MP/race pace</b></td><td>Rozgrzewka → bloki → przerwy → schłodzenie.</td></tr><tr><td><b>Basen</b></td><td>Rozgrzewka, drills, main set, rest, cooldown.</td></tr></tbody></table></div>
  <div class="card"><h3 style="margin-top:0">Podgląd pierwszego structured workout</h3><pre style="white-space:pre-wrap;color:var(--muted);line-height:1.45">${esc((structuredWorkouts.find(x=>x.category==='WORKOUT')||{}).description||'')}</pre></div>`;
  $('dlIntervalsIcs').onclick=()=>downloadText('plan_intervals.ics',buildICS('structured'),'text/calendar');
  $('dlGoogleIcs').onclick=()=>downloadText('plan_google.ics',buildICS('all'),'text/calendar');
  $('dlPayload').onclick=()=>downloadText('intervals_payload.json',JSON.stringify(buildIntervalsPayload(),null,2),'application/json');
  $('dlPayload2').onclick=()=>downloadText('intervals_payload.json',JSON.stringify(buildIntervalsPayload(),null,2),'application/json');
  $('copyCurl').onclick=()=>copyText(curl);
  $('copyIcsUrl').onclick=()=>copyText(($('icsUrl')?.textContent||''));
  $('hostUrl').oninput=()=>{prefs.hostUrl=$('hostUrl').value.trim(); savePrefs(); $('icsUrl').textContent=prefs.hostUrl?prefs.hostUrl.replace(/\/$/,'')+'/garmin/plan_intervals.ics':'Najpierw wpisz URL hostingu'};
}

function renderBackup(){ $('view-backup').innerHTML=`<div class="grid cols-2"><div class="card"><h3>Eksport danych</h3><p style="color:var(--muted)">Pobierz plik JSON i przenieś wpisy na telefon/tablet albo zachowaj backup.</p><button class="btn primary" id="exportBtn">Pobierz backup JSON</button></div><div class="card"><h3>Import danych</h3><p style="color:var(--muted)">Wczytaj wcześniej zapisany backup.</p><input class="input" type="file" id="importFile" accept="application/json"></div></div><div class="section-title"><div><h3>Jak używać na telefonie/tablecie?</h3></div></div><div class="card"><p style="line-height:1.65;color:var(--muted)">Najlepiej wrzucić ten folder na Netlify, GitHub Pages albo własny hosting. Wtedy otwierasz adres w Safari/Chrome i dodajesz do ekranu głównego. Aplikacja jest responsywna i działa jak PWA. Przy otwieraniu samego pliku lokalnie część funkcji offline może być ograniczona przez przeglądarkę.</p></div>`; $('exportBtn').onclick=exportBackup; $('importFile').onchange=importBackup;}
function exportBackup(){const blob=new Blob([JSON.stringify({version:2,created:new Date().toISOString(),logs},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='coach-center-backup.json'; a.click();}
function importBackup(e){const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{const data=JSON.parse(r.result); logs=data.logs||data; saveLogs(); toast('Backup wczytany ✅')}catch(err){toast('Nie udało się wczytać JSON')}}; r.readAsText(f)}
function openWorkout(id){const it=items.find(x=>x.id===id); if(!it)return; $('modalTitle').textContent=it.discipline; $('modalSub').textContent=`${fmtDate(it.date)} • ${it['Dzień']||''} • ${it.week}`; const l=getLog(id); $('modalBody').innerHTML=`${workoutFull(it)}<div class="section-title"><div><h3>Wpis po treningu</h3></div></div>${l.updated?`<div class="detail-grid"><div class="detail-item"><b>RPE / ból / sen</b><p>RPE ${esc(l.rpe||'—')} • ból ${esc(l.pain||'—')} • sen ${esc(l.sleep||'—')} h</p></div><div class="detail-item"><b>Dane</b><p>${esc(l.time||'—')} min • ${esc(l.km||'—')} km • ${esc(l.shoes||'—')}</p></div><div class="detail-item"><b>Źródło</b><p>${l.intervalsActivityId?'Intervals.icu auto':'manualnie'}</p></div><div class="detail-item"><b>Paliwo</b><p>${esc(l.fuel||'—')}</p></div><div class="detail-item"><b>Uwagi</b><p>${esc(l.notes||'—')}</p></div></div>`:'<div class="empty">Ten trening nie ma jeszcze wpisu.</div>'}<div style="margin-top:16px"><button class="btn primary" onclick="closeModal();prefillLog('${id}')">Uzupełnij / edytuj</button></div>`; $('detailModal').classList.add('active')}
function closeModal(){$('detailModal').classList.remove('active')}
function toast(msg){const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500)}
$('themeBtn').onclick=()=>{document.body.classList.toggle('light'); prefs.light=document.body.classList.contains('light'); savePrefs()}; if(prefs.light) document.body.classList.add('light');
if('serviceWorker' in navigator && location.protocol.startsWith('http')){navigator.serviceWorker.register('sw.js').catch(()=>{})}
window.forceAutoFillFromIntervals=forceAutoFillFromIntervals; window.autoFillLogsFromIntervals=autoFillLogsFromIntervals; renderAll(); showView('dashboard');
if(location.protocol.startsWith('http')){setTimeout(()=>syncIntervals(false),1200)}
