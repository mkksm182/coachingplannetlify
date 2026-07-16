(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CoachLocalData=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const manualFields=['rpe','pain','sleep','mental','shoes','fuel','notes'];
  const historyFields=['status','updated','autoSource','completionPercentage','percent','time','km','load','date','activityStart','name','activityName','sport'];
  function manualRecord(record){
    const source=record&&typeof record==='object'&&!Array.isArray(record)?record:{};
    const out={};
    manualFields.forEach(key=>{if(source[key]!==undefined&&source[key]!==null&&source[key]!=='')out[key]=source[key]});
    historyFields.forEach(key=>{if(source[key]!==undefined&&source[key]!==null&&source[key]!=='')out[key]=source[key]});
    if(source.userUpdated)out.userUpdated=source.userUpdated;
    return out;
  }
  function manualCollection(source){
    const records=source&&typeof source==='object'&&!Array.isArray(source)?source:{};
    return Object.fromEntries(Object.entries(records).map(([id,record])=>[id,manualRecord(record)]).filter(([,record])=>Object.keys(record).length));
  }
  function normalize(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Nieprawidłowy format backupu');
    const legacyLogs=data.logs&&typeof data.logs==='object'?data.logs:(data.kind?{}:data);
    const planLogs=manualCollection(data.planLogs||legacyLogs);
    const activityLogs=manualCollection(data.activityLogs||data.standaloneActivities||{});
    const preferences=data.preferences&&typeof data.preferences==='object'?{light:Boolean(data.preferences.light)}:{};
    return {planLogs,activityLogs,preferences};
  }
  function merge(target,incoming){
    const next={...(target||{})};
    Object.entries(incoming||{}).forEach(([id,manual])=>{next[id]={...(next[id]||{}),...manual}});
    return next;
  }
  function createExport(logs,activities,prefs,created){
    return {kind:'coach-center-local-data',version:3,created:created||new Date().toISOString(),planLogs:manualCollection(logs),activityLogs:manualCollection(activities),preferences:{light:Boolean(prefs&&prefs.light)}};
  }
  return {manualFields,historyFields,manualRecord,manualCollection,normalize,merge,createExport};
});
