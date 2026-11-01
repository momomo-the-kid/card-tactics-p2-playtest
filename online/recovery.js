(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.B4Recovery=api;})(globalThis,()=>{
 'use strict';
 const LIMIT_MS=60000,plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype,exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)),id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(x),rev=x=>Number.isSafeInteger(x)&&x>=0,secret=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),sync=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 // Compare elapsed time, not callback count. Wall time covers suspended runtimes;
 // monotonic time and the high-water mark cover backward wall-clock adjustment.
 function clock({wall=()=>Date.now(),monotonic=()=>performance.now()}={}){const w=wall(),m=monotonic();let high=0;return ()=>high=Math.max(high,wall()-w,monotonic()-m,0);}
 function createBudget({now=clock()}={}){let started=null,deadline=null,expired=false;function check(){const at=now();if(started!==null&&at>=deadline)expired=true;return {started,deadline,expired,elapsed:started===null?0:Math.max(0,at-started),remaining:deadline===null?LIMIT_MS:Math.max(0,deadline-at)};}return {start(since){if(started===null){const at=now();started=Number.isFinite(since)&&since>=0&&since<=at?since:at;deadline=started+LIMIT_MS;}return check();},limit(remaining){if(!Number.isFinite(remaining)||remaining<0||remaining>LIMIT_MS)return false;if(started===null)return false;deadline=Math.min(deadline,now()+remaining);check();return true;},check};}
 // One clock exists before a recovery budget. Suspension can therefore consume
 // an episode even when no close/error callback ran until the page returned.
 function createTimeline({now=clock()}={}){
  let authenticated=null,suspended=null,lastPump=now();
  const suspend=at=>{const t=now();at=Number.isFinite(at)&&at>=0&&at<=t?at:t;suspended=suspended===null?at:Math.min(suspended,at);};
  const gap=()=>{if(now()-lastPump>4000)suspend(lastPump);};
  const anchor=()=>suspended===null?null:Math.max(suspended,authenticated??suspended);
  return {now,suspend,gap,anchor,authenticated(){authenticated=now();},tick(){gap();lastPump=now();},stale(){gap();const at=anchor();return at!==null&&now()-at>8000;},recovered(){authenticated=now();lastPump=now();suspended=null;},clearSuspension(){suspended=null;lastPump=now();},inspect:()=>({authenticated,suspended,lastPump,anchor:anchor(),elapsed:anchor()===null?0:Math.max(0,now()-anchor())})};
 }
 function sameSecret(a,b){if(!secret(a)||!secret(b))return false;let difference=0;for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
 const types=new Set(['resumeHello','resumeState','resumeAck','resumeCommit','resumeReady','resumeActive','matchAbort','heartbeat','heartbeatReply','resultAck','resultConfirmed']);
 function validate(v,P,versions,matchId,revision=0){let size;try{size=JSON.stringify(v).length;}catch{return 'MALFORMED';}if(size>2097152||!plain(v)||!types.has(v.type))return 'MALFORMED';if(!id(v.matchId)||v.matchId!==matchId)return 'WRONG_MATCH';
  if(v.type==='resumeHello'){if(size>4096||!exact(v,['type','versions','matchId','secret','guestId','lastRevision','pendingActionId'])||!P.versions(v.versions)||!secret(v.secret)||!id(v.guestId)||!rev(v.lastRevision)||(v.pendingActionId!==null&&!id(v.pendingActionId)))return 'MALFORMED';return P.sameVersions(v.versions,versions)?null:'VERSION_MISMATCH';}
  if(v.type==='resumeState'){if(!exact(v,['type','versions','matchId','syncId','snapshot','receipt','remainingMs'])||!P.versions(v.versions)||!sync(v.syncId)||!Number.isFinite(v.remainingMs)||v.remainingMs<0||v.remainingMs>LIMIT_MS||!exact(v.receipt,['actionId','status'])||v.receipt.actionId!==null&&!id(v.receipt.actionId)||!['NONE','APPLIED','REJECTED','NOT_RECEIVED'].includes(v.receipt.status))return 'MALFORMED';if(!P.sameVersions(v.versions,versions))return 'VERSION_MISMATCH';return P.validateHost(v.snapshot,versions,matchId,revision);}
  if(['resumeAck','resumeCommit','resumeReady','resumeActive'].includes(v.type))return exact(v,['type','matchId','syncId','revision'])&&sync(v.syncId)&&rev(v.revision)?null:'MALFORMED';
  if(v.type==='matchAbort')return exact(v,['type','matchId','reason'])&&v.reason==='RECOVERY_TIMEOUT'?null:'MALFORMED';
  if(['resultAck','resultConfirmed'].includes(v.type))return exact(v,['type','matchId','revision'])&&rev(v.revision)?null:'MALFORMED';
  return exact(v,['type','matchId','sequence'])&&rev(v.sequence)?null:'MALFORMED';
 }
 return {LIMIT_MS,clock,createBudget,createTimeline,sameSecret,secret,sync,types,validate};
});
