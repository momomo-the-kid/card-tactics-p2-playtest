(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.B2Protocol=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const INVITE_PREFIX='card-tactics-b2-v3-';
const PROTOCOL='card-tactics-b2-invite-v3',tokenValid=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
function randomCode(cryptoSource=globalThis.crypto,excluded=new Set()) {
 // 4294000000 is the largest multiple of 1000000 below 2^32: rejection avoids modulo bias.
 for(let n=0;n<128;n++){const a=new Uint32Array(1);cryptoSource.getRandomValues(a);if(a[0]>=4294000000)continue;const code=String(a[0]%1000000).padStart(6,'0');if(!excluded.has(code))return code;}
 throw Error('CODE_GENERATION_FAILED');
}
function roomToken(cryptoSource=globalThis.crypto){const a=new Uint8Array(16);cryptoSource.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');}
function parseInvite(input){
 const value=typeof input==='string'?input.trim():'';if(!value)return {error:'EMPTY_INVITE'};
 if(/^\d{6}$/.test(value))return {code:value,token:null};
 if(/^ct-/.test(value))return {error:'LEGACY_INVITE'};
 let url;try{url=new URL(value);}catch{return {error:'INVALID_INVITE'};}
 if(!['http:','https:'].includes(url.protocol)||value.length>2048)return {error:'INVALID_INVITE'};
 const f=new URLSearchParams(url.hash.slice(1));if(/^ct-/.test(f.get('invite')||''))return {error:'LEGACY_INVITE'};
 if(f.get('v')!=='3')return {error:'INVITE_VERSION_MISMATCH'};
 if(!/^\d{6}$/.test(f.get('invite')||'')||!tokenValid(f.get('room'))||['invite','room','v','profile'].some(k=>f.getAll(k).length>1))return {error:'INVALID_INVITE'};
 return {code:f.get('invite'),token:f.get('room'),profile:['local','public'].includes(f.get('profile'))?f.get('profile'):null};
}
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,keys)=>isObject(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),id=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(v),revision=v=>Number.isSafeInteger(v)&&v>=0;
function versions(v){return exact(v,['protocol','core','cards'])&&Object.values(v).every(x=>typeof x==='string'&&x.length>0&&x.length<=128);}
function sameVersions(a,b){return versions(a)&&versions(b)&&['protocol','core','cards'].every(k=>a[k]===b[k]);}
function validate(v){let size;try{size=JSON.stringify(v)?.length;}catch{return 'MALFORMED';}if(!size||size>16384||!isObject(v))return 'MALFORMED';if(v.type==='hello')return exact(v,['type','versions','roomToken'])&&versions(v.versions)&&(v.roomToken===null||tokenValid(v.roomToken))?null:'MALFORMED';if(v.type!=='move')return 'UNKNOWN_MESSAGE';return exact(v,['type','matchId','actionId','expectedRevision','from','to'])&&id(v.matchId)&&id(v.actionId)&&revision(v.expectedRevision)&&[v.from,v.to].every(x=>Number.isInteger(x)&&x>=0&&x<25)?null:'MALFORMED';}
function reject(code,packet){return {type:'reject',code,actionId:id(packet?.actionId)?packet.actionId:null};}
// Privacy is first applied by existing Core projection. Only the subset needed by this move PoC is sent.
function wireView(Core,state,side){const v=Core.getPlayerView(state,side),out={};for(const k of ['revision','turn','activeSide','board','players','kingAction','coreVersion','gameOver','winner'])out[k]=v[k];out.enchantments=v.enchantments.filter(e=>e.cardId!=='マイン');return out;}
function sharedView(v){return JSON.parse(JSON.stringify(v));}
function validView(v){return exact(v,['revision','turn','activeSide','board','players','kingAction','coreVersion','gameOver','winner','enchantments'])&&revision(v.revision)&&Number.isInteger(v.turn)&&['p','c'].includes(v.activeSide)&&Array.isArray(v.board)&&v.board.length===25&&isObject(v.players)&&isObject(v.kingAction)&&Array.isArray(v.enchantments)&&typeof v.gameOver==='boolean';}
function validateHost(v,expected,matchId,currentRevision=-1){if(!isObject(v))return 'MALFORMED';if(v.type==='pending')return exact(v,['type','expiresIn'])&&v.expiresIn===60000?null:'MALFORMED';if(v.type==='reject')return exact(v,['type','code','actionId'])&&typeof v.code==='string'&&/^[A-Z0-9_]+$/.test(v.code)&&(v.actionId===null||id(v.actionId))?null:'MALFORMED';const welcome=v.type==='welcome';if(!welcome&&v.type!=='snapshot')return 'UNKNOWN_MESSAGE';if(!exact(v,welcome?['type','versions','matchId','side','view','events']:['type','matchId','view','events','actionId']))return 'MALFORMED';if(welcome&&(!sameVersions(v.versions,expected)||v.side!=='c'))return 'VERSION_MISMATCH';if(!welcome&&!(v.actionId===null||id(v.actionId)))return 'MALFORMED';if(!id(v.matchId)||matchId&&v.matchId!==matchId)return 'WRONG_MATCH';if(!validView(v.view)||!Array.isArray(v.events))return 'MALFORMED';if(v.view.revision<currentRevision)return 'OLD_SNAPSHOT';return null;}
function createHost({Core,definitions,versions:version,state:initial,roomToken:token}){
 if(!tokenValid(token))throw Error('ROOM_TOKEN_REQUIRED');
 let state=initial,bound=null,stopped=false,accepted=0,pending=new Map();
 const snapshot=(events=[],actionId=null)=>({type:'snapshot',matchId:state.server.matchId,view:wireView(Core,state,'c'),events:Core.projectEvents(events,'c'),actionId});
 function hello(key,v){if(stopped)return reject('SESSION_STOPPED',v);if(v?.type==='hello'&&versions(v.versions)&&!sameVersions(v.versions,version))return reject('VERSION_MISMATCH',v);const invalid=validate(v);if(invalid||v.type!=='hello')return reject(invalid||'EXPECTED_HELLO',v);if(!sameVersions(v.versions,version))return reject('VERSION_MISMATCH',v);if(v.roomToken!==null&&v.roomToken!==token)return reject('INVITE_EXPIRED',v);if(bound!==null)return reject(bound===key?'ALREADY_CONNECTED':'ROOM_FULL',v);if(pending.has(key))return reject('ALREADY_PENDING',v);if(pending.size>=2)return reject('QUEUE_FULL',v);pending.set(key,Date.now()+60000);return {type:'pending',expiresIn:60000};}
 function approve(key){if(stopped)return reject('SESSION_STOPPED');if(!pending.has(key))return reject('NO_PENDING');const expires=pending.get(key);pending.delete(key);if(Date.now()>=expires)return reject('APPROVAL_EXPIRED');if(bound!==null)return reject('ROOM_FULL');bound=key;return {type:'welcome',versions:{...version},matchId:state.server.matchId,side:'c',view:wireView(Core,state,'c'),events:[]};}
 function apply(actor,v){if(stopped)return reject('SESSION_STOPPED',v);if(bound===null)return reject('NOT_CONNECTED',v);const invalid=validate(v);if(invalid||v.type!=='move')return reject(invalid||'EXPECTED_MOVE',v);const r=Core.execute(state,{matchId:v.matchId,actionId:actor+':'+v.actionId,expectedRevision:v.expectedRevision,action:{type:'move',side:actor,from:v.from,to:v.to}},actor,definitions);if(!r.ok)return reject(/^[A-Z0-9_]+$/.test(r.code)?r.code:'CORE_REJECTED',v);state=r.state;accepted++;return snapshot(r.events,v.actionId);}
 return {hello,approve,clearPending(){if(stopped||bound!==null)return false;pending.clear();return true;},deny(key,code='DECLINED'){pending.delete(key);return reject(code);},receive:(key,v)=>key===bound?apply('c',v):reject('UNBOUND_CONNECTION',v),local:v=>apply('p',v),view:()=>wireView(Core,state,'p'),stop(){stopped=true;bound=null;pending.clear();},get stopped(){return stopped;},get accepted(){return accepted;},get revision(){return state.revision;}};
}
return {INVITE_PREFIX,PROTOCOL,randomCode,roomToken,parseInvite,versions,sameVersions,validate,validateHost,wireView,sharedView,createHost};
});
