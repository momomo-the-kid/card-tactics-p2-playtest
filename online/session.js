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

(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../p2-b2/session.js'):root.B2Protocol,typeof module==='object'&&module.exports?require('../../core/deck-validation.cjs').create:root.B2Runtime.deckValidationFactory);if(typeof module==='object'&&module.exports)module.exports=api;else root.B2Protocol=root.B3Match=api;})(globalThis,function(Invite,DeckFactory){
'use strict';
const PROTOCOL='card-tactics-b3-match-v1',INVITE_PREFIX='card-tactics-b3-v1-',clone=x=>JSON.parse(JSON.stringify(x)),plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype,exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)),id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(x);
const ACTIONS=['summon','move','attack_creature','attack_king','play_spell','play_enchant','end_turn','chooseTokenCell','choosePromotion','activate_ability','surrender'];
function normalGame({Core,definitions,random,seed,matchId,coin,decks,hostDeck,guestDeck}){
 const holder={rngState:seed>>>0};const hostSide=(coin??(random(holder)<.5))?'p':'c';
 const standard=Object.entries(definitions).filter(([,d])=>(d.deckType||'normal')==='normal').flatMap(([name,d])=>Array(d.deckCount||0).fill(name));if(standard.length!==40)throw Error('STANDARD_DECK_SIZE');
 const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random(holder)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const perSide=decks||{[hostSide]:hostDeck||standard,[hostSide==='p'?'c':'p']:guestDeck||standard};const prepared={p:shuffle(perSide.p),c:shuffle(perSide.c)};
 return {state:Core.createGame({decks:prepared,serverData:{matchId,rngState:holder.rngState}}),assignment:{host:hostSide,guest:hostSide==='p'?'c':'p',first:'p'}};
}
function choices(Core,state,side,defs){
 if(state.server.gameOver)return [];
 let out=[];const add=a=>{if(a&&ACTIONS.includes(a.type))out.push(a);};
 const pc=state.server.pendingChoice,ps=state.server.pendingSummon;
 if(pc){if(pc.side===side)for(const accept of [true,false])add({type:'choosePromotion',side,accept});}
 else if(ps){if(ps.side===side)for(const to of ps.choices)add({type:'chooseTokenCell',side,to});}
 else if(Core.combatInputAllowed(state,side)){
  Core.legalCombatActions(state,side,defs).forEach(add);
  for(const card of state.private[side].hand){const q=Core.queryCard(state,side,card,defs);if(q.stage==='source')for(const source of q.choices)Core.queryCard(state,side,{...card,sourceInstanceId:source.target.instanceId},defs).choices.forEach(add);
   else if(card.cardId==='解呪')for(const a of q.choices)Core.queryCard(state,side,{...card,target:a.target},defs).choices.forEach(add);
   else q.choices.forEach(add);
  }
  for(const piece of state.board.filter(p=>p?.side===side))Core.queryAbility(state,side,{abilityId:'sorcerer_bolt',sourceInstanceId:piece.sourceInstanceId},defs).forEach(add);
  Core.queryAbility(state,side,{abilityId:'awaken_attack'},defs).forEach(add);add({type:'end_turn',side});
 }
 add({type:'surrender',side});return [...new Map(out.map(a=>[JSON.stringify(a),a])).values()];
}
function safeAction(a){const b={};for(const k of ['type','cardId','instanceId','from','to','abilityId','sourceInstanceId','accept','effectId'])if(Object.hasOwn(a,k)&&a[k]!==undefined)b[k]=a[k];if(a.target){b.target={};for(const k of ['kind','side','instanceId','k'])if(Object.hasOwn(a.target,k))b.target[k]=a.target[k];}return b;}
function validCommand(v){let size;try{size=JSON.stringify(v).length;}catch{return false;}return size<=4096&&exact(v,['type','matchId','actionId','expectedRevision','choiceId'])&&v.type==='command'&&id(v.matchId)&&id(v.actionId)&&Number.isSafeInteger(v.expectedRevision)&&v.expectedRevision>=0&&id(v.choiceId);}
function reject(code,v){return {type:'reject',code,actionId:id(v?.actionId)?v.actionId:null};}
function deckRules(definitions){return DeckFactory(Object.fromEntries(Object.entries(definitions).map(([k,d])=>[k,{...d,deckType:d.deckType||'normal'}])));}
function createHost({Core,definitions,versions,state:config}){
 let state=null,assignment=null,initializations=0,bound=null,stopped=false,accepted=0,pending=new Map(),outcomes=[];const token=config.token,rules=deckRules(definitions);let guestDeck=null;const maps={p:new Map(),c:new Map()};
 function initialize(){if(state)return;const created=config.fixture?config.fixture():normalGame({Core,definitions,...config,guestDeck});state=created.state;assignment=created.assignment;initializations++;}
 function options(side){maps[side].clear();return choices(Core,state,side,definitions).map((a,i)=>{const choiceId='r'+state.revision+':'+side+':'+i;maps[side].set(choiceId,a);return {choiceId,action:safeAction(a)};});}
 function view(role='host'){
  if(!state)return null;const side=assignment[role],v=Core.getPlayerView(state,side),choice=state.server.pendingChoice,tokenChoice=state.server.pendingSummon;
  return {...v,surrenderPending:!!state.server.pendingSurrenders?.some(q=>q.side===side),power:state.board.map(p=>p?Core.powerForPiece(state,p,definitions)?.total:null),viewer:side,assignment:{...assignment},options:options(side),choice:choice?.side===side?{kind:'promotion',cell:choice.cell,from:choice.from,to:choice.to}:tokenChoice?.side===side?{kind:'token',cells:tokenChoice.choices.slice()}:null,outcome:state.server.gameOver?{winner:state.server.winner??null,draw:!!state.server.draw,reason:outcomes.findLast(e=>e.type==='game:over')?.reason||'GAME_OVER'}:null};
 }
 const snapshot=(events=[],actionId=null)=>({type:'snapshot',matchId:state.server.matchId,view:view('guest'),events:Core.projectEvents(events,assignment.guest),actionId});
 function hello(key,v){let bytes;try{bytes=JSON.stringify(v).length;}catch{return reject('MALFORMED',v);}if(bytes>16384)return reject('MALFORMED',v);if(stopped)return reject('SESSION_STOPPED',v);if(v?.type==='hello'&&Invite.versions(v.versions)&&!Invite.sameVersions(v.versions,versions))return reject('VERSION_MISMATCH',v);if(!exact(v,['type','versions','roomToken','deck'])||v.type!=='hello'||!Invite.versions(v.versions)||(v.roomToken!==null&&!/^[a-f0-9]{32}$/.test(v.roomToken)))return reject('MALFORMED',v);if(!Array.isArray(v.deck)||v.deck.length!==40||v.deck.some(c=>typeof c!=='string'||!rules.defaultCounts().hasOwnProperty(c))||!rules.valid(Object.fromEntries([...new Set(v.deck)].map(c=>[c,v.deck.filter(x=>x===c).length]))))return reject('INVALID_DECK',v);if(v.roomToken!==null&&v.roomToken!==token)return reject('INVITE_EXPIRED',v);if(bound)return reject(bound===key?'ALREADY_CONNECTED':'ROOM_FULL',v);if(pending.has(key))return reject('ALREADY_PENDING',v);if(pending.size>=2)return reject('QUEUE_FULL',v);pending.set(key,{expires:Date.now()+60000,deck:clone(v.deck)});return {type:'pending',expiresIn:60000};}
 function approve(key){if(stopped)return reject('SESSION_STOPPED');if(!pending.has(key))return reject('NO_PENDING');const item=pending.get(key);pending.delete(key);if(Date.now()>=item.expires)return reject('APPROVAL_EXPIRED');if(bound)return reject('ROOM_FULL');guestDeck=item.deck;initialize();bound=key;return {type:'welcome',versions:{...versions},matchId:state.server.matchId,side:assignment.guest,view:view('guest'),events:[]};}
 function apply(role,v){if(stopped)return reject('SESSION_STOPPED',v);if(!bound)return reject('NOT_CONNECTED',v);if(v?.type==='undo')return reject(exact(v,['type'])?'UNDO_DISABLED':'MALFORMED',v);if(!validCommand(v))return reject('MALFORMED',v);const side=assignment[role];if(v.matchId!==state.server.matchId)return reject('WRONG_MATCH',v);if(state.server.processedActionIds?.includes(side+':'+v.actionId))return reject('DUPLICATE_ACTION',v);if(v.expectedRevision!==state.revision)return reject('STALE_REVISION',v);if(state.server.gameOver)return reject('GAME_OVER',v);
  options(side);const action=maps[side].get(v.choiceId);if(!action)return reject('INVALID_CHOICE',v);const result=Core.execute(state,{matchId:v.matchId,actionId:v.actionId,expectedRevision:v.expectedRevision,action},side,definitions);if(!result.ok)return reject(/^[A-Z0-9_]+$/.test(result.code)?result.code:'CORE_REJECTED',v);state=result.state;accepted++;outcomes.push(...result.events.filter(e=>e.type==='game:over'));return snapshot(result.events,v.actionId);
 }
 return {hello,approve,local:v=>apply('host',v),receive:(key,v)=>key===bound?apply('guest',v):reject('UNBOUND_CONNECTION',v),deny(key,code='DECLINED'){pending.delete(key);return reject(code);},clearPending(){if(stopped||bound)return false;pending.clear();return true;},view:()=>view('host'),stop(){stopped=true;bound=null;pending.clear();},get accepted(){return accepted;},get initializations(){return initializations;}};
}
function validView(v){
 const keys=['revision','turn','activeSide','board','players','kingAction','enchantments','ownHand','hands','coreVersion','gameOver','winner','viewer','assignment','options','choice','outcome','power','surrenderPending'];
 if(!exact(v,keys)||!['p','c'].includes(v.viewer)||!Number.isSafeInteger(v.revision)||v.revision<0||!Number.isSafeInteger(v.turn)||v.turn<1||!['p','c'].includes(v.activeSide)||!Array.isArray(v.board)||v.board.length!==25||!Array.isArray(v.power)||v.power.length!==25||!exact(v.players,['p','c'])||!exact(v.hands,['p','c'])||!plain(v.kingAction)||!Array.isArray(v.ownHand)||!Array.isArray(v.enchantments)||typeof v.gameOver!=='boolean'||typeof v.surrenderPending!=='boolean'||!['p','c',null].includes(v.winner)||typeof v.coreVersion!=='string')return false;
 if(!exact(v.assignment,['host','guest','first'])||!['p','c'].includes(v.assignment.host)||v.assignment.guest!==(v.assignment.host==='p'?'c':'p')||v.assignment.first!=='p')return false;
 for(const side of ['p','c'])if(!plain(v.players[side])||!['kingHp','mana','maxMana','handCount','deckCount'].every(k=>Number.isSafeInteger(v.players[side][k]))||!Array.isArray(v.players[side].graveyard)||!Array.isArray(v.hands[side])||v.hands[side].some(c=>!plain(c)||!id(c.instanceId)||typeof c.faceUp!=='boolean'||c.faceUp&&typeof c.cardId!=='string'||!c.faceUp&&Object.hasOwn(c,'cardId')))return false;
 if(v.ownHand.some(c=>!plain(c)||!id(c.instanceId)||typeof c.cardId!=='string')||v.board.some(c=>c!==null&&(!plain(c)||!['p','c'].includes(c.side)||typeof c.type!=='string'||!Number.isInteger(c.hp))))return false;
 if(v.choice!==null&&(!plain(v.choice)||!['promotion','token'].includes(v.choice.kind)))return false;
 if(v.outcome!==null&&(!exact(v.outcome,['winner','draw','reason'])||!['p','c',null].includes(v.outcome.winner)||typeof v.outcome.draw!=='boolean'||typeof v.outcome.reason!=='string'||!/^[A-Z_]{1,60}$/.test(v.outcome.reason)))return false;
 return Array.isArray(v.options)&&v.options.length<=20000&&v.options.every(x=>exact(x,['choiceId','action'])&&id(x.choiceId)&&plain(x.action)&&ACTIONS.includes(x.action.type)&&Object.keys(x.action).every(k=>['type','cardId','instanceId','from','to','abilityId','sourceInstanceId','accept','effectId','target'].includes(k))&&(!x.action.target||plain(x.action.target)&&Object.keys(x.action.target).every(k=>['kind','side','instanceId','k'].includes(k))));
}
const EVENT_KEYS={'card:played':['side','cardId'],'card:drawn':['side','instanceId'],'dispel:resolved':['side','removed'],'king:attack-targeted':['side','abilityId','cell'],'king:ability-used':['side','abilityId','cell'],'creature:ability-used':['side','abilityId','from'],'game:over':['winner','reason'],'turn:started':['side'],'turn:ended':['side'],'king:hp-set':['side','before','after','reason'],'mana:gained':['side','before','after'],'pressure:resolved':['side','countAtCommit','success','target'],'king:damaged':['side','amount','hp'],'creature:moved':['from','to'],'creature:attacked':['from','to','targetKind','amount'],'creature:attack-resolved':['from','to','targetKind','amount']};
function validEvent(e){return plain(e)&&Object.hasOwn(EVENT_KEYS,e.type)&&Object.keys(e).every(k=>k==='type'||EVENT_KEYS[e.type].includes(k));}
function validateHost(v,expected,matchId,revision=-1){let size;try{size=JSON.stringify(v).length;}catch{return 'MALFORMED';}if(size>2097152)return 'MALFORMED';if(!plain(v))return 'MALFORMED';if(v.type==='reject'||v.type==='pending')return Invite.validateHost(v,expected,matchId,revision);const welcome=v.type==='welcome';if(!welcome&&v.type!=='snapshot')return 'UNKNOWN_MESSAGE';if(!exact(v,welcome?['type','versions','matchId','side','view','events']:['type','matchId','view','events','actionId']))return 'MALFORMED';if(welcome&&(!Invite.sameVersions(v.versions,expected)||v.side!==v.view?.viewer||v.side!==v.view?.assignment?.guest))return 'VERSION_MISMATCH';if(!id(v.matchId)||matchId&&v.matchId!==matchId)return 'WRONG_MATCH';if(!validView(v.view)||!Array.isArray(v.events)||v.events.some(e=>!validEvent(e))||!welcome&&!(v.actionId===null||id(v.actionId)))return 'MALFORMED';return v.view.revision<revision?'OLD_SNAPSHOT':null;}
return {...Invite,PROTOCOL,INVITE_PREFIX,ACTIONS,deckRules,normalGame,choices,safeAction,validCommand,validView,createHost,validateHost,sharedView:clone};
});
