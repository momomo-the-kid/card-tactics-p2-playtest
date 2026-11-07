'use strict';
(()=>{const modules={"./game-core.cjs":function(module,exports,require){
'use strict';
/** Command boundary. Local one-action Undo is provided by a4-session.cjs; unsupported actions remain explicit. */
const {createState,playerSnapshot}=require('./game-state.cjs');
const {applyAction}=require('./action-bridge.cjs');
const combat=require('./combat-engine.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const VERSION='a5.2';
function createGame(config){
 const input={...config},events=[];
 if(config.decks){input.board||=Array(25).fill(null);input.players||=Object.fromEntries(['p','c'].map(side=>[side,{kingHp:20,maxMana:1,mana:1,graveyard:[]}]));input.privateData=Object.fromEntries(['p','c'].map(side=>[side,{hand:[],deck:config.decks[side]}]));}
 const s=createState(input);require('./match-rules.cjs').attach(s,config.rules??s.server.rules);
 if(config.lossConditions){if(!config.lossRegistryId)throw Error('LOSS_REGISTRY_ID_REQUIRED');require('./outcome-registry.cjs').register(config.lossRegistryId,config.lossConditions);s.server.lossRegistry=config.lossRegistryId;}
 s.server.coreVersion=VERSION;s.server.processedActionIds=[];
 if(config.decks)require('./match-rules.cjs').initialize(s,s.server.rules,events);return s;
}
function execute(state,request,actor,definitions){
 if(typeof request?.actionId!=='string'||!request.actionId||request.actionId.length>100)return {ok:false,code:'INVALID_ACTION_ID'};
 if(!['p','c'].includes(actor)||request.action?.side!==actor)return {ok:false,code:'UNAUTHORIZED_SIDE'};
 if(state.server.matchId&&state.server.matchId!==request.matchId)return {ok:false,code:'WRONG_MATCH'};
 if(state.server.processedActionIds?.includes(actor+':'+request.actionId))return {ok:false,code:'DUPLICATE_ACTION'};
 const shape=require('./core-contract.cjs').validateRequest(request,actor,state.revision);if(!shape.ok)return shape;
 try{require('./game-state.cjs').assertState(state);}catch{return {ok:false,code:'INVALID_STATE'};}
 if(state.server.gameOver)return {ok:false,code:'GAME_OVER'};
 if(request.action.type!=='surrender'&&state.server.pendingSurrenders?.length&&!state.server.processingDepth&&!state.server.pendingTriggerCount&&!state.server.resolving&&!state.server.effectQueue?.length&&!state.server.pendingChoice&&!state.server.pendingEntry&&!state.server.pendingSummon)return {ok:false,code:'PENDING_SURRENDER_BOUNDARY_REQUIRED'};
 let result;
 if(request.action.type==='surrender'){
   const next=clone(state),order=(next.server.surrenderSequence||0)+1;
  const receipt={side:actor,actionId:request.actionId,order,acceptedRevision:state.revision+1};
  next.server.surrenderSequence=order;next.server.pendingSurrenders||=[];next.server.pendingSurrenders.push(receipt);
  result={ok:true,status:'deferred',receipt:clone(receipt),state:next,events:[{type:'surrender:accepted',...receipt}]};
  next.revision++;
 }else {try{result=require('./damage-choices.cjs').run(state,request,actor,definitions,applyAction);}catch(e){return {ok:false,code:e.message};}if(!result.ok)return result;}
 result.state.server.processedActionIds||=[];result.state.server.processedActionIds.push(actor+':'+request.actionId);
 result.state.server.coreVersion=VERSION;
 const boundary=require('./resolution-boundary.cjs').settleBoundary(result.state,result.events);
 if(request.action.type==='surrender'){const own=e=>e.side===actor&&e.actionId===request.actionId;result.status=result.events.some(e=>e.type==='surrender:applied'&&own(e))?'applied':result.events.some(e=>e.type==='surrender:unapplied'&&own(e))?'unapplied':'deferred';}result.gameOver=!!result.state.server.gameOver;return result;
}
function finishBoundary(state,runtime){
 if(!runtime||typeof runtime.resolving!=='boolean'||!Array.isArray(runtime.queue)||!Array.isArray(runtime.summonQueue))return {ok:false,code:'RUNTIME_CONTEXT_REQUIRED'};
 if(runtime.resolving||runtime.queue.length||runtime.summonQueue.length)return {ok:false,code:'RUNTIME_RESOLUTION_PENDING'};
 try{require('./game-state.cjs').assertState(state);}catch{return {ok:false,code:'INVALID_STATE'};}
 const next=clone(state),events=[],before=next.revision;next.revision++;const r=require('./resolution-boundary.cjs').settleBoundary(next,events);if(r.status!=='applied')next.revision=before;
 return {ok:true,status:r.status,state:next,events};
}
function initializeLegacyMatch(S,rules){const core=require('./legacy-adapter.cjs').fromLegacyState(S),events=[];require('./match-rules.cjs').initialize(core,rules,events);core.server.coreVersion=VERSION;core.server.processedActionIds=[];require('./r4-command-bridge.cjs').commit(S,core,events);return {ok:true,state:core,events};}
function getPlayerView(state,viewer){
 const view=playerSnapshot(state,viewer);
 return {...view,coreVersion:VERSION,gameOver:!!state.server.gameOver,winner:state.server.winner??null};
}
// Fail closed for unknown events. Internal snapshots, target coordinates and RNG never copied wholesale.
function projectEvents(events,viewer){
 if(!['p','c'].includes(viewer))throw new TypeError('Invalid viewer');
 const out=[];
 for(const e of events){
  if(e.type==='card:played'){out.push({type:e.type,side:e.side,cardId:e.cardId});continue;}
  if(e.type==='dispel:resolved'){out.push({type:e.type,side:e.side,removed:e.removed,...(e.weakened?{weakened:true}:{})});continue;}
  if(e.type==='damage:guarded'){out.push({type:e.type,cell:e.cell,guardian:e.guardian,amount:e.amount});continue;}
  if(e.type==='creature:weakened'){out.push({type:e.type,creature:e.creature});continue;}
  if(e.type==='card:drawn'){out.push({type:e.type,side:e.side,...(e.side===viewer?{instanceId:e.instanceId}:{})});continue;}
  if(['king:attack-targeted','king:ability-used'].includes(e.type)){out.push({type:e.type,side:e.side,abilityId:e.abilityId,cell:e.cell});continue;}
  if(e.type==='creature:ability-used'){out.push({type:e.type,side:e.side,abilityId:e.abilityId,from:e.from});continue;}
  if(e.type==='game:over'){out.push({type:e.type,winner:e.winner,reason:e.reason});continue;}
  if(e.type==='turn:started'||e.type==='turn:ended'){out.push({type:e.type,side:e.side});continue;}
  if(e.type==='king:hp-set'){out.push({type:e.type,side:e.side,before:e.before,after:e.after,reason:e.reason});continue;}
  if(e.type==='mana:gained'){out.push({type:e.type,side:e.side,before:{maxMana:e.before.maxMana,mana:e.before.mana},after:{maxMana:e.after.maxMana,mana:e.after.mana}});continue;}
  if(e.type==='pressure:resolved'){out.push({type:e.type,side:e.side,countAtCommit:e.countAtCommit,success:e.success,target:e.target});continue;}
  if(e.type==='king:damaged'){out.push({type:e.type,side:e.side,amount:e.amount,hp:e.hp});continue;}
  if(e.type==='creature:moved'){out.push({type:e.type,from:e.from,to:e.to});continue;}
  if(['creature:attacked','creature:attack-resolved'].includes(e.type)){out.push({type:e.type,from:e.from,to:e.to,targetKind:e.targetKind,amount:e.amount});continue;}
 }
 return clone(out);
}
const emptyCombat=()=>({moves:[],targets:[],attackRange:[],king:false});
function combatBlocked(state,actor,runtime){
 const s=state.server||{};
 return !['p','c'].includes(actor)||actor!==state.activeSide||s.gameOver||s.pendingChoice||s.pendingSummon||s.pendingEntry||s.effectQueue?.length||Object.keys(s.pendingCardTransfers||{}).length||runtime?.resolving||runtime?.queue?.length||runtime?.summonQueue?.length;
}
function combatInputAllowed(state,actor,runtime){return !combatBlocked(state,actor,runtime);}
// Preview ignores turn/runtime locks; it is never an executable command list.
function previewCombat(state,from,definitions){
 return {moves:combat.squares(state,from,definitions,'move'),targets:combat.squares(state,from,definitions,'attack'),attackRange:combat.attackRange(state,from,definitions),king:combat.kingReachable(state,from,definitions)};
}
function queryCombat(state,from,actor,definitions,runtime){
 if(combatBlocked(state,actor,runtime)||state.board[from]?.side!==actor)return emptyCombat();
 return previewCombat(state,from,definitions);
}
// Geometric post-move forecast only: entry effects/promotion are not simulated.
// Revalidate the actual command after the real move. Never mutate the live board.
function planCombat(state,from,to,actor,definitions,runtime){
 if(!queryCombat(state,from,actor,definitions,runtime).moves.includes(to))return emptyCombat();
 const board=state.board.slice();board[to]={...board[from],m:true};board[from]=null;
 return previewCombat({...state,board},to,definitions);
}
function combatPattern(piece,definitions,kind='move',state){return piece?combat.pattern(piece,definitions,kind,state).map(v=>v.slice()):[];}
function combatRights(piece,definitions,state){return combat.rights(piece,definitions,state);}
function combatPathClear(state,from,dr,dc,piece,definitions){return combat.pathClear(state,from,dr,dc,piece,definitions);}
function legalCombatActions(state,actor,definitions,runtime){
 if(combatBlocked(state,actor,runtime))return [];
 const out=[];state.board.forEach((p,from)=>{if(!p||p.side!==actor)return;
  for(const to of combat.squares(state,from,definitions,'move'))out.push({type:'move',side:actor,from,to});
  for(const to of combat.squares(state,from,definitions,'attack'))out.push({type:'attack_creature',side:actor,from,to});
  if(combat.kingReachable(state,from,definitions))out.push({type:'attack_king',side:actor,from});
 });return out;
}
const targets=require("./target-queries.cjs");
const powerQuery=require('./power-query.cjs');
module.exports={damageReduction:require('./damage-engine.cjs').reduction,initializeLegacyMatch,normalizeRules:require('./match-rules.cjs').normalize,attackLimit:combat.attackLimit,finishBoundary,effectiveAbilities:require('./effective-rules.js').abilities,createGame,queryPower:powerQuery.query,powerForPiece:powerQuery.forPiece,spellsBlocked:targets.sealed,dispelEffects:targets.effectChoices,queryCard:targets.queryCard,queryGuardianChoices:require('./damage-choices.cjs').choices,queryEffectChoices:require('./wind-spells.cjs').choices,queryAbility:targets.queryAbility,VERSION,execute,getPlayerView,projectEvents,legalCombatActions,queryCombat,previewCombat,planCombat,combatPattern,combatRights,combatPathClear,combatInputAllowed};

},
"./game-state.cjs":function(module,exports,require){
'use strict';
/** Server-owned match state and viewer-specific snapshots. Not a rules engine. */
const {SIDES}=require('./core-contract.cjs');
const {normalizeHand,assertUniqueHandIds,visibleHand}=require('./hand-visibility.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function assertState(s){
 if(!s||typeof s!=='object'||!Number.isSafeInteger(s.revision)||s.revision<0||!SIDES.includes(s.activeSide))throw new TypeError('Invalid state header');
 if(!Array.isArray(s.board)||s.board.length!==25)throw new TypeError('Invalid board');
 if(!s.players||!s.private||!s.server)throw new TypeError('Missing state sections');
 for(const side of SIDES){
  const p=s.players[side],secret=s.private[side];
  if(!p||!Number.isInteger(p.kingHp)||!Number.isInteger(p.mana)||!Number.isInteger(p.maxMana)||!Array.isArray(p.graveyard))throw new TypeError('Invalid player');
  if(!secret||!Array.isArray(secret.hand)||!Array.isArray(secret.deck))throw new TypeError('Invalid private data');
 }
 require('./resolution-boundary.cjs').assertSurrenderState(s);assertUniqueHandIds(s);require('./physical-zones.cjs').assertUnique(s);if(s.server.rules!==undefined)require('./match-rules.cjs').get(s);require('./outcome-registry.cjs').validate(s.server.lossRegistry);return true;
}
function createState({board=Array(25).fill(null),players,privateData,serverData={},activeSide='p',revision=0,turn=1,enchantments=[]}){
 const privateCopy=clone(privateData);
 for(const side of SIDES)if(privateCopy?.[side]&&Array.isArray(privateCopy[side].hand))privateCopy[side].hand=normalizeHand(privateCopy[side].hand,side);
 const s={revision,turn,activeSide,board:clone(board),players:clone(players),private:privateCopy,enchantments:clone(enchantments),server:clone(serverData)};
 assertState(s);return s;
}
function publicSnapshot(s){
 assertState(s);const players={};
 for(const side of SIDES){players[side]={...clone(s.players[side]),handCount:s.private[side].hand.length,deckCount:s.private[side].deck.length};}
 return {revision:s.revision,turn:s.turn,activeSide:s.activeSide,board:clone(s.board),players,kingAction:clone(s.server.kingAction||{p:{},c:{}}),enchantments:clone(s.enchantments.filter(e=>!e.hidden&&e.cardId!=='マイン'))};
}
function playerSnapshot(s,side){
 if(!SIDES.includes(side))throw new TypeError('Invalid viewer');
 const view=publicSnapshot(s);
 view.enchantments.push(...clone(s.enchantments.filter(e=>e.cardId==='マイン'&&e.owner===side)));
 view.ownHand=clone(s.private[side].hand);
 view.hands={p:visibleHand(s,side,'p'),c:visibleHand(s,side,'c')};
 return view;
}
function serverSnapshot(s){assertState(s);return clone(s);}
module.exports={assertState,createState,publicSnapshot,playerSnapshot,serverSnapshot};

},
"./core-contract.cjs":function(module,exports,require){
'use strict';
/** First server-facing boundary: validates transport/action shape only.
 * This is NOT yet an authoritative rules engine. No UI, DOM or globals. */
const SIDES = Object.freeze(['p','c']);
const ACTION_TYPES = Object.freeze(['summon','move','attack_creature','attack_king','play_spell','play_enchant','end_turn','chooseTokenCell','choosePromotion','chooseEffectCell','chooseGuardian','activate_ability','surrender']);
const CELL_MAX=24;
const isCell=n=>Number.isInteger(n)&&n>=0&&n<=CELL_MAX;
const isSide=s=>SIDES.includes(s);
const isCard=s=>typeof s==='string'&&s.length>0&&s.length<=100;
function validateAction(action){
 if(!action||typeof action!=='object'||Array.isArray(action))return {ok:false,code:'INVALID_ACTION'};
 if(!ACTION_TYPES.includes(action.type))return {ok:false,code:'UNKNOWN_ACTION'};
 if(!isSide(action.side))return {ok:false,code:'INVALID_SIDE'};
 let valid=false;
 switch(action.type){
 case 'summon': valid=isCard(action.cardId)&&isCell(action.to);break;
 case 'move':case 'attack_creature':valid=isCell(action.from)&&isCell(action.to);break;
 case 'attack_king':valid=isCell(action.from);break;
 case 'play_spell':case 'play_enchant':valid=isCard(action.cardId);break;
 case 'chooseGuardian':case 'chooseEffectCell':case 'chooseTokenCell':valid=isCell(action.to);break;
 case 'choosePromotion':valid=typeof action.accept==='boolean';break;
 case 'end_turn':case 'surrender':valid=true;break;
 case 'activate_ability':valid=['sorcerer_bolt','awaken_attack','royal_wind','heal','fortune_draw','generate_golem'].includes(action.abilityId);break;
 }
 return valid?{ok:true,action:Object.freeze({...action})}:{ok:false,code:'INVALID_PAYLOAD'};
}
function validateEnvelope(envelope){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return {ok:false,code:'INVALID_ENVELOPE'};
 if(typeof envelope.matchId!=='string'||!envelope.matchId||!Number.isSafeInteger(envelope.expectedRevision)||envelope.expectedRevision<0)return {ok:false,code:'INVALID_ENVELOPE'};
 const result=validateAction(envelope.action);
 if(!result.ok)return result;
 return {ok:true,envelope:Object.freeze({matchId:envelope.matchId,expectedRevision:envelope.expectedRevision,action:result.action})};
}
function validateRequest(envelope,authenticatedSide,currentRevision){
 const r=validateEnvelope(envelope);if(!r.ok)return r;
 if(!isSide(authenticatedSide)||r.envelope.action.side!==authenticatedSide)return {ok:false,code:'UNAUTHORIZED_SIDE'};
 if(r.envelope.expectedRevision!==currentRevision)return {ok:false,code:'STALE_REVISION'};
 return r;
}
function makeResult({revision,events=[],state,gameOver=false}){
 if(!Number.isSafeInteger(revision)||revision<0||!Array.isArray(events))throw new TypeError('Invalid result');
 return {revision,events:events.map(e=>({...e})),state,gameOver:Boolean(gameOver)};
}
module.exports={SIDES,ACTION_TYPES,validateAction,validateEnvelope,validateRequest,makeResult};

},
"./hand-visibility.cjs":function(module,exports,require){
'use strict';
/** Server-owned per-instance card identities and hand visibility. */
const {SIDES}=require('./core-contract.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function assertCard(card){
 if(!card||typeof card.instanceId!=='string'||!card.instanceId||typeof card.cardId!=='string'||!card.cardId)throw new TypeError('Invalid card instance');
}
function normalizeHand(hand,side){
 if(!SIDES.includes(side)||!Array.isArray(hand))throw new TypeError('Invalid hand');
 return hand.map((card,index)=>{
  const item=typeof card==='string'?{instanceId:`${side}-initial-${index}`,cardId:card}:clone(card);
  assertCard(item);return item;
 });
}
function assertUniqueHandIds(state){
 const ids=new Set();
 for(const side of SIDES)for(const card of state.private[side].hand){assertCard(card);if(ids.has(card.instanceId))throw new TypeError('Duplicate card instanceId');ids.add(card.instanceId)}
 return true;
}
function visibleHand(state,viewer,owner){
 if(!SIDES.includes(viewer)||!SIDES.includes(owner))throw new TypeError('Invalid side');
 const revealed=state.server?.revealedTo?.[viewer]||[];
 return state.private[owner].hand.map(card=>{
  assertCard(card);
  return viewer===owner||revealed.includes(card.instanceId)
   ?{instanceId:card.instanceId,cardId:card.cardId,faceUp:true}
   :{instanceId:card.instanceId,faceUp:false};
 });
}
function revealCards(state,viewer,instanceIds){
 if(!SIDES.includes(viewer)||!Array.isArray(instanceIds))throw new TypeError('Invalid reveal');
 const other=viewer==='p'?'c':'p';
 const valid=new Set(state.private[other].hand.map(c=>c.instanceId));
 if(!instanceIds.every(id=>valid.has(id)))throw new RangeError('Card not in opponent hand');
 state.server.revealedTo??={};state.server.revealedTo[viewer]??=[];
 state.server.revealedTo[viewer]=[...new Set([...state.server.revealedTo[viewer],...instanceIds])];
}
function forgetCard(state,instanceId){
 for(const side of SIDES){const known=state.server?.revealedTo?.[side];if(known)state.server.revealedTo[side]=known.filter(id=>id!==instanceId)}
}
module.exports={normalizeHand,assertUniqueHandIds,visibleHand,revealCards,forgetCard};

},
"./resolution-boundary.cjs":function(module,exports,require){
'use strict';
const {settleLosses}=require('./a1-rules.js');
const active=new WeakMap(),chains=new WeakMap();
// R17's provisional single/conflict structures are unsupported candidate snapshots.
// Replay accepted commands into R18 instead of guessing an order from old data.
function assertSurrenderState(state){
 const s=state.server;
 if(s.pendingSurrender!==undefined||s.pendingSurrenderConflict!==undefined)throw Error('UNSUPPORTED_R17_SURRENDER_STATE');
 if(s.surrenderSequence!==undefined&&(!Number.isSafeInteger(s.surrenderSequence)||s.surrenderSequence<0))throw Error('INVALID_SURRENDER_SEQUENCE');
 if(s.pendingSurrenders!==undefined){
  if(!Array.isArray(s.pendingSurrenders)||!s.pendingSurrenders.length)throw Error('INVALID_SURRENDER_QUEUE');
  let order=0,revision=0;const ids=new Set();
  for(const q of s.pendingSurrenders){
   if(!q||!['p','c'].includes(q.side)||typeof q.actionId!=='string'||!q.actionId||q.actionId.length>100||!Number.isSafeInteger(q.order)||q.order<=order||q.order>(s.surrenderSequence||0)||!Number.isSafeInteger(q.acceptedRevision)||q.acceptedRevision<=revision||q.acceptedRevision>state.revision||ids.has(q.side+':'+q.actionId))throw Error('INVALID_SURRENDER_QUEUE');
   order=q.order;revision=q.acceptedRevision;ids.add(q.side+':'+q.actionId);
  }
 }
}
function clearSurrenders(state,events,reason){
 for(const q of state.server.pendingSurrenders||[])events.push({type:'surrender:unapplied',...q,reason});
 delete state.server.pendingSurrenders;
}
function settleBoundary(state,events,losses=[],{reason='STATE_LOSS',unitBoundary=false}={}){
 assertSurrenderState(state);
 if(state.server.gameOver){clearSurrenders(state,events,'GAME_ALREADY_OVER');return {status:'already-ended'};}
 if(state.server.pendingChoice?.type==='guardian')return {status:'deferred'};
 if((state.server.processingDepth||state.server.pendingTriggerCount)&&!unitBoundary)return {status:'deferred'};
 const all=losses.map(x=>typeof x==='string'?{side:x,reason}:x);
 for(const side of ['p','c'])if(state.players[side].kingHp<=0&&!all.some(l=>l.side===side))all.push({side,reason:'KING_HP_ZERO'});
 all.push(...require('./outcome-registry.cjs').evaluate(state));
 if(all.length){const result=settleLosses(all.map(x=>x.side));Object.assign(state.server,result);events.push({type:'game:over',winner:result.winner,draw:result.draw,reason:all.length===1?all[0].reason:reason,losses:all});clearSurrenders(state,events,'NORMAL_RESULT_PRECEDENCE');return {status:'applied'};}
 const pending=state.server.pendingSurrenders?.[0];
 if(pending&&!state.server.processingDepth&&!state.server.pendingTriggerCount&&!state.server.effectQueue?.length&&!state.server.resolving&&!state.server.pendingChoice&&!state.server.pendingEntry&&!state.server.pendingSummon){
  Object.assign(state.server,{gameOver:true,winner:pending.side==='p'?'c':'p',draw:false});
  events.push({type:'surrender:applied',...pending,appliedRevision:state.revision},{type:'game:over',winner:state.server.winner,draw:false,reason:'SURRENDER'});
  for(const q of state.server.pendingSurrenders.slice(1))events.push({type:'surrender:unapplied',...q,reason:'MATCH_ENDED_BY_PRIOR_SURRENDER',appliedOrder:pending.order});
  delete state.server.pendingSurrenders;return {status:'applied'};
 }return {status:pending?'deferred':'idle'};
}
/** Group operations record losses; only the explicit group boundary decides the result.
 * Existing cards are sequential. A simultaneous group must be explicitly supplied by an effect definition.
 */
function resolveGroup(state,operations,{simultaneous=false}={}){
 if(state.server.gameOver)return [];
 const events=[],losses=[];
 const context={state,events,lose:(side,reason)=>{if(!['p','c'].includes(side))throw new TypeError('Invalid loser');losses.push(reason?{side,reason}:side)}};
 const settle=()=>settleBoundary(state,events,losses,{reason:simultaneous?'SIMULTANEOUS_LOSS':'SEQUENTIAL_LOSS',unitBoundary:true});
 for(const operation of operations){operation(context);if(!simultaneous){settle();if(state.server.gameOver)break;}}
 if(simultaneous)settle();return events;
}
function validTarget(state,t){return !!t&&(t.kind==='creature'?state.board.some(p=>p&&p.sourceInstanceId===t.instanceId):t.kind==='king'||t.kind==='player'?['p','c'].includes(t.side):t.kind==='cell'?Number.isInteger(t.k)&&t.k>=0&&t.k<25:t.kind==='global');}
function declarationValid(state,action,d){const ts=action.targets||(action.target?[action.target]:[]);return Array.isArray(ts)&&(d.targetCount==null||ts.length===d.targetCount)&&ts.every(t=>validTarget(state,t));}
function defer(state,jobs){const unit=active.get(state);if(!unit)return false;unit.jobs.push(...jobs);return true;}
function observe(defs,stage,state){defs.$hooks?.observe?.(stage,state);}
function runEffectUnit(state,descriptor,context,defs){
 if(!descriptor||!['sequential','simultaneous'].includes(descriptor.mode)||!['valid-only','all-required'].includes(descriptor.targetPolicy)||!Array.isArray(descriptor.operations))throw Error('INVALID_EFFECT_UNIT');
 const events=[],targets=structuredClone(context.targets||[]),previous=active.get(state),unit={jobs:[]},oldDepth=state.server.processingDepth||0;
 active.set(state,unit);state.server.processingDepth=oldDepth+1;
 let success=true;
 try{
  descriptor.beforeResolve?.(state,context); // Trusted definition fixture boundary; never client code.
  const eligible=targets.map(t=>validTarget(state,t));
  if(descriptor.targetPolicy==='all-required'&&eligible.some(v=>!v)){events.push({type:'effect:fizzled',unitId:descriptor.unitId,reason:'ALL_REQUIRED_TARGETS'});success=false;}
  else{
   const done=new Map();
   const operations=descriptor.operations.map((op,index)=>ctx=>{
    const label=op.id??String(index),t=op.target??targets[op.targetIndex??0];
    if(op.requires&&!op.requires.every(id=>done.get(id)===true)){done.set(label,false);events.push({type:'effect:fizzled',operationId:label,reason:'DEPENDENCY'});return;}
    if(!['mana','emit'].includes(op.kind)&&!validTarget(state,t)){done.set(label,false);events.push({type:'effect:fizzled',operationId:label,reason:'INVALID_TARGET'});return;}
    let ok=true;
    if(op.kind==='mana'){const result=require('./mana-delta.cjs').applyManaDelta(state,op.side??context.side,op.delta,ctx.events,'effect-unit');if(!result.ok)throw Error(result.code);}
    else if(op.kind==='damage'){
     if(!Number.isSafeInteger(op.amount)||op.amount<0)throw Error('INVALID_DAMAGE');
     if(t.kind==='king'){const hit=require('./damage-engine.cjs').damageKing(state,t.side,op.amount,ctx.events);if(hit.defeated)ctx.lose(t.side,'KING_HP_ZERO');}
     else if(t.kind==='creature'){const cell=state.board.findIndex(p=>p?.sourceInstanceId===t.instanceId),hit=require('./damage-engine.cjs').damageCreature(state,cell,op.amount,defs);ctx.events.push(...hit.events);for(const e of hit.events)require('./effect-events.cjs').dispatch(state,e.type,e,defs,ctx.events);}
     else throw Error('INVALID_DAMAGE_TARGET');
    }else if(op.kind==='draw'){
     if(t.kind!=='player'||!Number.isSafeInteger(op.count)||op.count<0)throw Error('INVALID_DRAW');
     const limit=require('./match-rules.cjs').get(state).handLimit;if(limit!=null&&state.private[t.side].hand.length+op.count>limit)throw Error('HAND_LIMIT_POLICY_REQUIRES_DECISION');
     for(let i=0;i<op.count&&!state.server.gameOver;i++){
      const card=require('./card-zones.cjs').drawCard(state,t.side);
      if(!card){ctx.lose(t.side,'DRAW_FAILED');ok=false;break;}
      require('./match-rules.cjs').recordDraw(state,t.side,card,op.reason||'effect',ctx.events,defs);
     }
    }else if(op.kind==='heal'){
     ok=require('./healing.cjs').recover(state,t,op.amount,defs,ctx.events);
    }else if(op.kind==='weaken'){
     ok=t.kind==='creature'&&require('./creature-status.cjs').paralyze(state,t.instanceId,ctx.events);
    }else if(op.kind==='growAttack'){
     if(t.kind!=='creature'||!Number.isSafeInteger(op.amount)||op.amount<0)throw Error('INVALID_GROWTH');
     ok=require('./power-query.cjs').adjust(state,t.instanceId,op.amount);
    }else if(op.kind==='betrayal'){const k=state.board.findIndex(p=>p?.sourceInstanceId===t.instanceId);ok=require('./a1-state.cjs').applyBetrayalEffect(state,k,context.side,ctx.events,defs);}
    else if(op.kind==='controller'){const k=state.board.findIndex(p=>p?.sourceInstanceId===t.instanceId);ok=require('./a1-state.cjs').changeController(state,k,op.side,ctx.events,defs);}
    else if(op.kind==='transform'){const k=state.board.findIndex(p=>p?.sourceInstanceId===t.instanceId);ok=require('./a1-state.cjs').promote(state,k,op.to,defs,ctx.events);}
    else if(op.kind==='emit'){ctx.events.push({type:op.eventType,...op.detail});require('./effect-events.cjs').dispatch(state,op.eventType,op.detail||{},defs,ctx.events);}
    else throw Error('UNSUPPORTED_OPERATION');done.set(label,ok);
   });
   events.push(...resolveGroup(state,operations,{simultaneous:descriptor.mode==='simultaneous'}));
  }
 }finally{if(oldDepth)state.server.processingDepth=oldDepth;else delete state.server.processingDepth;if(previous)active.set(state,previous);else active.delete(state);}
 if(previous)previous.jobs.push(...unit.jobs);else if(!state.server.gameOver){const oldCount=state.server.pendingTriggerCount||0;state.server.pendingTriggerCount=oldCount+unit.jobs.length;try{observe(defs,'unit-complete',state);require('./effect-events.cjs').resolveCollected(state,unit.jobs,defs,events);}finally{if(oldCount)state.server.pendingTriggerCount=oldCount;else delete state.server.pendingTriggerCount;}}
 settleBoundary(state,events);return {ok:true,success,events};
}
function resolveEffectUnit(state,descriptor,context,defs){const root=!chains.has(state),chain=chains.get(state)||{remaining:256};if(--chain.remaining<0)throw Error('EFFECT_CHAIN_LIMIT');if(root)chains.set(state,chain);try{return runEffectUnit(state,descriptor,context,defs);}finally{if(root)chains.delete(state);}}
module.exports={assertSurrenderState,resolveGroup,settleBoundary,resolveEffectUnit,declarationValid,validTarget,defer,observe};

},
"./a1-rules.js":function(module,exports,require){
/* Shared A1 rule kernel. Generated HTML embeds these exact bytes; Node requires this file. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./effective-rules.js'));else root.A1Rules=factory(root.EffectiveRules);})(typeof globalThis==='object'?globalThis:this,function(Effective){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const other=s=>s==='p'?'c':'p';
function sortTriggers(jobs,activeSide){return jobs.slice().sort((a,b)=>
 (a.controller===activeSide?0:1)-(b.controller===activeSide?0:1)||
 (activeSide==='p'?-1:1)*(a.cell-b.cell)||Number(a.sourceKind==='cell')-Number(b.sourceKind==='cell')||a.order-b.order||a.sequence-b.sequence);}
function changeController(piece,next){
 if(!piece||!['p','c'].includes(next)||piece.side===next)return null;
 const before=copy(piece);piece.side=next;return {type:'creature:controller-changed',before,after:copy(piece),from:before.side,to:next,triggerController:before.side};
}
function transform(piece,fromDef,toDef,to){
 const before=copy(piece),damage=Math.max(0,fromDef.hp-piece.hp);
 piece.type=to;piece.atk=toDef.atk;piece.hp=toDef.hp-damage;
 return {type:'creature:promoted',before,after:copy(piece),from:before.type,to,triggerController:before.side,lethal:piece.hp<=0};
}
function blocked(piece){return (piece.actionRestrictions||[]).some(e=>e.kind==='move-attack-prohibited');}
function restrict(piece,caster,id){(piece.actionRestrictions||=[]).push({id,kind:'move-attack-prohibited',caster,expiresAt:'turn-end'});}
function expireRestrictions(board,side){for(const p of board)if(p)p.actionRestrictions=(p.actionRestrictions||[]).filter(e=>!(e.expiresAt==='turn-end'&&e.caster===side));}
// Capture all eligible sources before resolving the first job. No handler-registration ordering.
function collect(type,context,board,definitions,state){
 const specs=type==='turn:started'?board.map((p,cell)=>({p,cell,role:'turn'})).filter(x=>x.p?.side===context.side):
 type==='creature:attack-resolved'?[{p:context.attacker,cell:context.from,role:'attacker'},{p:context.target,cell:context.to,role:'target'}]:[];
 const out=[];
 for(const {p,cell,role} of specs){if(!p)continue;
  Effective.abilities(p,definitions,state).forEach((id,order)=>{
   const eligible=(role==='turn'&&id==='diablo_turn_start')||
    (role==='attacker'&&['thief_attack_mana','orthros_self_damage','attack_exchange_power','attack_heal_king','attack_paralyze'].includes(id))||
    (role==='target'&&id==='salamander_counter'&&context.targetKind==='creature'&&p.side!==context.attacker.side);
   if(eligible)out.push({id,source:copy(p),controller:p.side,cell,order,sequence:out.length,context:copy(context)});
  });
 }
 return out;
}
function resolve(jobs,port,result){
 for(const job of sortTriggers(jobs,port.activeSide())){
  if(port.gameOver())break;
  port.trace?.({type:'ability:triggered',ability:job.id,triggerController:job.controller,cell:job.cell,instanceId:job.source.sourceInstanceId});
  if(job.id==='diablo_turn_start')port.damageKing(job.controller,2);
  if(job.id==='orthros_self_damage')port.damageKing(job.controller,1);
  if(job.id==='thief_attack_mana')port.gainAttackMana(job.controller); // Independent cap fix belongs to A2.
  if(job.id==='attack_exchange_power'){
   port.adjustAttack?.(job.context.target?.sourceInstanceId,-2);
   port.adjustAttack?.(job.source.sourceInstanceId,2);
  }
  if(job.id==='attack_heal_king'&&result?.hpLost>0)port.healKing?.(job.controller,result.hpLost);
  if(job.id==='attack_paralyze')port.paralyze?.(job.context.target?.sourceInstanceId);
  if(job.id==='salamander_counter'){
   const cell=port.findCreature(job.context.attacker.sourceInstanceId);
   if(cell>=0)port.damageCreature(cell,3);
  }
  if(job.id!=='thief_attack_mana')port.trace?.({type:'ability:resolved',ability:job.id,side:job.controller,instanceId:job.source.sourceInstanceId});
 }
}
function attack(port,from,to){
 if(port.gameOver()||!port.legal(from,to))return null;
 const attacker=port.piece(from),target=to===null?null:port.piece(to),amount=port.power(attacker);
 port.spend(attacker);
 const context={attacker:copy(attacker),target:target?copy(target):undefined,targetKind:to===null?'king':'creature',from,to,side:other(attacker.side),amount};
 // Target/Controller/ability snapshots belong to the accepted attack, even if a source leaves.
 const jobs=collect('creature:attack-resolved',context,port.board(),port.definitions,port.state?.());
 port.emit('creature:attacked',context);
 if(port.gameOver())return {amount,side:context.side,defeated:false,interrupted:true};
 // A before-attack effect may remove attacker/target. Never redirect into a replacement.
 if(port.piece(from)!==attacker||(target&&port.piece(to)!==target))return {amount,side:context.side,defeated:false,interrupted:true};
 let result;
 if(to===null){
  const hit=port.damageKing(context.side,amount);
  result=typeof hit==='object'?{...hit,side:context.side}:{amount,side:context.side,defeated:hit};
 }else result=port.damageCreature(to,amount);
 if(port.gameOver())return result;
 port.emit('creature:attack-resolved',{...context,...(result.redirected?{amount:result.amount}:{}),defeated:!!result.defeated});
 port.beforeResolveCollected?.(jobs,context);resolve(jobs,port,result);
 return result;
}
// Explicit group boundary: apply all simultaneous changes, then determine draw/winner once.
function settleLosses(losses){const sides=[...new Set(losses)];return sides.length===2?{gameOver:true,winner:null,draw:true}:sides.length?{gameOver:true,winner:other(sides[0]),draw:false}:{gameOver:false};}
return {sortTriggers,changeController,transform,blocked,restrict,expireRestrictions,collect,resolve,attack,settleLosses};
});

},
"./effective-rules.js":function(module,exports,require){
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.EffectiveRules=f();})(globalThis,function(){
'use strict';
const identity=p=>p?.sourceInstanceId??p?.instanceId;
const KINDS={dancer_aura:'continuous',war_wolf_pack:'continuous',thief_attack_mana:'triggered',orthros_self_damage:'triggered',salamander_counter:'triggered',diablo_turn_start:'triggered',sorcerer_bolt:'activated',promote_assassin:'triggered',guard_barricade:'triggered',orthros_double_attack:'continuous'};
function enabled(state,subject,id,kind,sourceId=identity(subject)){
 const controls=[...(state?.abilityControls||[]),...(subject?.abilityControls||[])];
 return !controls.some(c=>c&&c.disabled===true&&c.active!==false&&(c.targetId==null||String(c.targetId)===String(identity(subject)))&&(c.abilityId==null||c.abilityId===id)&&(c.kind==null||c.kind===kind)&&(c.sourceId==null||String(c.sourceId)===String(sourceId))&&(c.targetId!=null||c.abilityId!=null||c.kind!=null||c.sourceId!=null));
}
function abilities(piece,defs,state){return (defs[piece?.type]?.abilities||[]).filter(id=>enabled(state,piece,id,defs[piece.type].abilityKinds?.[id]||KINDS[id]||((defs[piece.type].triggers||[]).some(t=>t.id===id)?'triggered':'continuous')));}
function berserkActive(state,p){const related=(state?.enchantments||[]).filter(e=>e.cardId==='バーサーク'&&e.target?.kind==='creature'&&(e.target.ref===p||identity(p)!=null&&String(e.target.instanceId??identity(e.target.ref))===String(identity(p))));return related.length?related.some(e=>(!e.zone||e.zone==='attached')&&(e.remainingTurns==null||Number.isInteger(e.remainingTurns)&&e.remainingTurns>0)&&enabled(state,p,'berserk_effect','modifier',e.instanceId)):p.berserk>0&&enabled(state,p,'berserk_effect','modifier');}
function numeric(base,multiplier,add,modifiers=[]){
 const live=modifiers.filter(m=>m.active!==false),rep=live.filter(m=>m.mode==='replace'),mul=live.filter(m=>m.mode==='multiply');
 if(rep.length>1||rep.length&&mul.length)throw Error('MODIFIER_ORDER_REQUIRES_DECISION');
 for(const m of live)if(!['replace','multiply','add','bounds'].includes(m.mode)||m.mode!=='bounds'&&!Number.isFinite(m.value)||m.mode==='bounds'&&(m.min!=null&&!Number.isFinite(m.min)||m.max!=null&&!Number.isFinite(m.max)||m.min!=null&&m.max!=null&&m.min>m.max))throw Error('INVALID_MODIFIER');
 let value=rep.length?rep[0].value:base*multiplier*mul.reduce((n,m)=>n*m.value,1);
 value+=add+live.filter(m=>m.mode==='add').reduce((n,m)=>n+m.value,0);
 const bounds=live.filter(m=>m.mode==='bounds'),min=Math.max(-Infinity,...bounds.map(m=>m.min??-Infinity)),max=Math.min(Infinity,...bounds.map(m=>m.max??Infinity));if(min>max)throw Error('MODIFIER_BOUNDS_REQUIRES_DECISION');
 return Math.min(max,Math.max(min,value));
}
return {abilities,enabled,numeric,berserkActive,KINDS};
});

},
"./outcome-registry.cjs":function(module,exports,require){
'use strict';
// Trusted process bootstrap, never request payload or serialized functions.
const registries=new Map(),copy=x=>JSON.parse(JSON.stringify(x));
function freeze(x){if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(freeze);}return x;}
function register(id,conditions){if(typeof id!=='string'||!id||!Array.isArray(conditions)||conditions.some(c=>!c||typeof c.id!=='string'||typeof c.check!=='function')||new Set(conditions.map(c=>c.id)).size!==conditions.length)throw Error('INVALID_LOSS_REGISTRY');if(registries.has(id))throw Error('REGISTRY_ALREADY_FIXED');registries.set(id,conditions.map(c=>Object.freeze({...c})));return id;}
function validate(id){if(id!=null&&!registries.has(id))throw Error('LOSS_REGISTRY_UNAVAILABLE');}
function evaluate(s){const id=s.server.lossRegistry;if(id==null)return [];validate(id);const view=freeze(copy(s)),out=[];for(const c of registries.get(id)){const losses=c.check(view);if(!Array.isArray(losses)||losses.some(l=>!['p','c'].includes(l.side)||typeof l.reason!=='string'))throw Error('INVALID_LOSS_RESULT');out.push(...losses.map(l=>({...l,conditionId:c.id})));}return out;}
module.exports={register,evaluate,validate};

},
"./mana-delta.cjs":function(module,exports,require){
'use strict';
function applyManaDelta(s,side,delta,events=[],reason='effect'){
 if(!['p','c'].includes(side)||!delta||Object.keys(delta).some(k=>!['maxDelta','availableDelta'].includes(k)))return {ok:false,code:'INVALID_MANA_DELTA'};
 const {maxDelta=0,availableDelta=0}=delta,p=s.players?.[side];
 if(!p||![maxDelta,availableDelta,p.maxMana,p.mana].every(Number.isSafeInteger)||p.maxMana<0||p.mana<0||p.maxMana+maxDelta<0||p.mana+availableDelta<0)return {ok:false,code:'INVALID_MANA_DELTA'};
 const before={maxMana:p.maxMana,mana:p.mana},after={maxMana:Math.min(10,p.maxMana+maxDelta),mana:Math.min(10,p.mana+availableDelta)};
 if(after.maxMana<before.maxMana)after.mana=Math.min(after.mana,after.maxMana);
 Object.assign(p,after);s.server.manaBonus||={p:0,c:0};s.server.manaBonus[side]=(s.server.manaBonus[side]||0)+(after.maxMana-before.maxMana);
 events.push({type:maxDelta>=0&&availableDelta>=0?'mana:gained':'mana:changed',side,before,after,reason});return {ok:true,before,after};
}
module.exports={applyManaDelta};

},
"./damage-engine.cjs":function(module,exports,require){
'use strict';
/** Shared server-side creature damage and defeat lifecycle; mutates supplied staged state. */
const {defeatCreature}=require('./card-zones.cjs');
function attachedCell(state,cell,id){return (state.enchantments||[]).filter(e=>e.cardId===id&&e.zone!=='graveyard'&&e.target?.kind==='cell'&&e.target.k===cell);}
function moveEnchantToGraveyard(state,e){
 const index=state.enchantments.indexOf(e);
 if(index<0)throw new Error('Enchantment not active');
 if(!state.players[e.owner]?.graveyard)throw new Error('Invalid enchantment owner');
 state.enchantments.splice(index,1);
 state.players[e.owner].graveyard.push({instanceId:e.instanceId,cardId:e.cardId});
}
function globalReduction(state){return (state.enchantments||[]).filter(e=>e.cardId==='恩寵の光'&&e.zone!=='graveyard'&&e.target?.kind==='global'&&e.remainingTurns>0).length;}
function reduction(state,cell){return globalReduction(state)+(cell==null?0:attachedCell(state,cell,'防御結界').length);}
function damageKing(state,side,amount,events=[]){
 if(!['p','c'].includes(side)||!Number.isSafeInteger(amount)||amount<0)throw new TypeError('Invalid king damage');
 const p=state.players[side],reduced=reduction(state),dealt=Math.max(0,amount-reduced);
 if(state.server.gameOver)return {amount:0,defeated:p.kingHp<=0};
 const hpLost=Math.min(Math.max(0,p.kingHp),dealt);
 p.kingHp=Math.max(0,p.kingHp-dealt);
 events.push({type:'king:damaged',side,amount:dealt,rawAmount:amount,reduction:reduced,hp:p.kingHp});
 return {amount:dealt,rawAmount:amount,reduction:reduced,defeated:p.kingHp<=0,hpLost};
}
function planDamage(state,cell,amount,defs){
 if(!Number.isSafeInteger(cell)||cell<0||cell>=25||!Number.isSafeInteger(amount)||amount<0)throw new TypeError('Invalid damage request');
 const piece=state.board[cell];
 if(!piece)return null;
 const reduced=reduction(state,cell),dealt=Math.max(0,amount-reduced);
 const guards=dealt===0?[]:require('./board-neighbors.cjs').orthogonalCells(cell).filter(k=>{
  const guardian=state.board[k];
  return guardian?.side===piece.side&&require('./effective-rules.js').abilities(guardian,defs,state).includes('guard_damage');
 });
 const guardian=require('./damage-choices.cjs').select(state,cell,piece.side,guards,defs);
 return {cell,recipient:guardian??cell,amount:dealt,rawAmount:amount,reduction:reduced};
}
function applyDamage(state,hits,defs){
 const events=[],totals=new Map();
 for(const hit of hits)totals.set(hit.recipient,(totals.get(hit.recipient)||0)+hit.amount);
 const removals=[...totals].flatMap(([cell,amount])=>state.board[cell].hp<=amount?[prepareDefeat(state,cell,defs)]:[]);
 for(const [cell,amount] of totals)state.board[cell].hp-=amount;
 for(const hit of hits)if(hit.amount>0){
  const {cell,recipient,amount,rawAmount,reduction}=hit;
  if(cell!==recipient)events.push({type:'damage:guarded',cell,guardian:recipient,amount});
  events.push({type:'creature:damaged',cell:recipient,amount,rawAmount,reduction});
 }
 removeCreatures(state,removals,defs,events);
 return events;
}
function damageCreature(state,cell,amount,defs){
 const hit=planDamage(state,cell,amount,defs);
 if(!hit)return {ok:false,code:'NO_CREATURE',events:[]};
 const targetHp=state.board[cell].hp,recipientHp=state.board[hit.recipient].hp;
 const redirected=hit.recipient!==cell;
 const hpLost=Math.min(Math.max(0,targetHp),Math.max(0,recipientHp),hit.amount);
 const events=applyDamage(state,[hit],defs);
 return {ok:true,defeated:!state.board[cell],amount:redirected?0:hit.amount,...(redirected?{redirected}:{}),rawAmount:hit.rawAmount,reduction:hit.reduction,hpLost,events};
}
function damageCreatureGroup(state,cells,amount,defs){
 const hits=[...new Set(cells)].map(cell=>planDamage(state,cell,amount,defs)).filter(Boolean);
 return applyDamage(state,hits,defs);
}
function prepareDefeat(state,cell,defs){
 const piece=state.board[cell],def=defs?.[piece?.type];
 if(!def)throw new TypeError('Missing creature definition');
 if(!def.token&&!piece.generatedToken&&(!piece.sourceInstanceId||!state.players[piece.owner]?.graveyard))throw new TypeError('Invalid creature owner');
 const attached=(state.enchantments||[]).filter(e=>e.target?.kind==='creature'&&e.target.instanceId===piece.sourceInstanceId).map(e=>e.instanceId);
 for(const id of attached)if(!state.players[state.enchantments.find(e=>e.instanceId===id).owner]?.graveyard)throw new TypeError('Invalid enchantment owner');
 return {cell,attached};
}
function removeCreatures(state,removals,defs,events){
 for(const {cell,attached} of removals){
  for(const instanceId of attached){
   const e=state.enchantments.find(e=>e.instanceId===instanceId);
   moveEnchantToGraveyard(state,e);
   events.push({type:'enchantment:removed',instanceId,cardId:e.cardId,reason:'creature-defeated'});
  }
  const {piece,graveyardAdded}=defeatCreature(state,cell,defs);
  events.push({type:'creature:defeated',cell,instanceId:piece.sourceInstanceId,cardId:piece.type,owner:piece.owner,graveyardAdded});
 }
}
function destroyCreatures(state,cells,defs){
 const events=[];
 removeCreatures(state,[...new Set(cells)].map(cell=>prepareDefeat(state,cell,defs)),defs,events);
 return events;
}
function triggerMine(state,cell,definitions,selectedJobs=null,expectedId=null){
 const A3=require('./a3-rules.js'),target=state.board[cell];
 if((!target&&!selectedJobs)||state.server.gameOver)return {triggered:false,events:[]};
 const jobs=selectedJobs||A3.mines(state.enchantments,cell,state.activeSide),events=[];let damage;
 for(const queued of jobs){
  if(state.server.gameOver)break;
  const mine=state.enchantments.find(e=>e.instanceId===queued.instanceId);
  if(mine)moveEnchantToGraveyard(state,mine);
  events.push({type:'enchantment:triggered',cardId:'マイン',instanceId:queued.instanceId,cell,triggerController:queued.controller??queued.owner});
  if(!state.board[cell]||(expectedId&&state.board[cell].sourceInstanceId!==expectedId)||(target?.sourceInstanceId?state.board[cell].sourceInstanceId!==target.sourceInstanceId:state.board[cell]!==target)){events.push({type:'effect:fizzled',instanceId:queued.instanceId,reason:'TARGET_GONE'});continue;}
  damage=damageCreature(state,cell,5,definitions);events.push(...damage.events);require('./effect-events.cjs').dispatchGroup(state,damage.events,definitions,events);
 }
 return {triggered:jobs.length>0,events,damage};
}
module.exports={damageKing,reduction,globalReduction,damageCreature,damageCreatureGroup,destroyCreatures,triggerMine,attachedCell};

},
"./card-zones.cjs":function(module,exports,require){
'use strict';
/** Server-only atomic card transfers. Prototype: does not enforce game rules/mana. */
const {SIDES}=require('./core-contract.cjs');
const {forgetCard}=require('./hand-visibility.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const ZONES=['deck','hand','graveyard'];
function location(state,side,zone){
 if(!SIDES.includes(side)||!ZONES.includes(zone))throw new TypeError('Invalid card location');
 const list=zone==='graveyard'?state.players?.[side]?.graveyard:state.private?.[side]?.[zone];
 if(!Array.isArray(list))throw new TypeError('Missing card zone');return list;
}
function inventory(state){return SIDES.flatMap(side=>ZONES.flatMap(zone=>location(state,side,zone).map((card,index)=>({side,zone,index,card}))));}
function ensureInstances(state){
 require('./physical-zones.cjs').assertUnique(state);
 state.server??={};let counter=state.server.nextCardSerial;
 if(counter===undefined)counter=1;
 if(!Number.isSafeInteger(counter)||counter<1)throw new TypeError('Invalid nextCardSerial');
 const used=new Set([...state.board.filter(Boolean).map(p=>p.sourceInstanceId),...state.enchantments.map(e=>e.instanceId)].filter(x=>x!==undefined).map(String));for(const {card} of inventory(state))if(typeof card==='object'&&card!==null){
  if(typeof card.instanceId!=='string'||!card.instanceId||typeof card.cardId!=='string'||!card.cardId)throw new TypeError('Invalid card instance');
  if(used.has(card.instanceId))throw new Error('Duplicate instanceId');used.add(card.instanceId);
 }else if(typeof card!=='string'||!card)throw new TypeError('Invalid legacy card');
 for(const {side,zone,index,card} of inventory(state))if(typeof card==='string'){
  let id;do{id=`card-${counter++}`}while(used.has(id));used.add(id);
  location(state,side,zone)[index]={instanceId:id,cardId:card};
 }
 state.server.nextCardSerial=counter;return state;
}
function transferCard(state,{fromSide,toSide=fromSide,fromZone,toZone,instanceId,position='bottom'}){
 if(typeof instanceId!=='string'||!instanceId)throw new TypeError('Missing instanceId');
 if(!['top','bottom'].includes(position))throw new TypeError('Invalid destination position');
 // Stage changes on a copy: failed operations never mutate the source state.
 const next=clone(state);ensureInstances(next);
 const source=location(next,fromSide,fromZone),dest=location(next,toSide,toZone);
 const index=source.findIndex(c=>c.instanceId===instanceId);
 if(index<0)throw new RangeError('Card not in source zone');
 if(source===dest)throw new RangeError('Source and destination are the same');
 const [card]=source.splice(index,1);
 if(fromZone==='hand')forgetCard(next,instanceId);
 if(position==='top')dest.unshift(card);else dest.push(card);
 // Preserve caller's state object identity, commit only after successful transfer.
 for(const key of Object.keys(state))delete state[key];Object.assign(state,next);
 return clone(card);
}
/** Move a creature card from hand to the board. Never add it to graveyard here. */
function summonFromHand(state,side,instanceId,cell,piece){
 if(!Number.isInteger(cell)||cell<0||cell>=25||state.board[cell]!==null)throw new RangeError('Invalid summon cell');
 const next=clone(state);ensureInstances(next);
 const hand=location(next,side,'hand');const index=hand.findIndex(c=>c.instanceId===instanceId);
 if(index<0)throw new RangeError('Card not in hand');
 if(!piece||piece.sourceInstanceId!==instanceId||piece.owner!==side)throw new TypeError('Invalid piece identity');
 hand.splice(index,1);forgetCard(next,instanceId);
 next.board[cell]=clone(piece);
 for(const key of Object.keys(state))delete state[key];Object.assign(state,next);
 return clone(piece);
}
/** On defeat, return the physical card to its owner's graveyard, not its controller's. */
function defeatCreature(state,cell,definitions){
 if(!Number.isInteger(cell)||cell<0||cell>=25)throw new RangeError('Invalid cell');
 const next=clone(state);ensureInstances(next);
 const piece=next.board[cell];if(!piece)throw new RangeError('No creature at cell');
 const owner=piece.owner;const definition=definitions?.[piece.type];
 if(!SIDES.includes(owner)||!definition)throw new TypeError('Invalid creature ownership or definition');
 const token=definition.token||piece.generatedToken;
 if(!token){
  if(typeof piece.sourceInstanceId!=='string'||!piece.sourceInstanceId)throw new TypeError('Missing sourceInstanceId');
  const existing=inventory(next).some(x=>x.card.instanceId===piece.sourceInstanceId);
  if(existing)throw new Error('Duplicate card instance across zones');
  location(next,owner,'graveyard').push({instanceId:piece.sourceInstanceId,cardId:piece.type});
 }
 next.board[cell]=null;
 for(const key of Object.keys(state))delete state[key];Object.assign(state,next);
 return {piece:clone(piece),graveyardAdded:!token};
}
function drawCard(state,side){ensureInstances(state);const deck=location(state,side,'deck');if(!deck.length)return null;return transferCard(state,{fromSide:side,fromZone:'deck',toZone:'hand',instanceId:deck[0].instanceId});}
function playCard(state,side,id){return transferCard(state,{fromSide:side,fromZone:'hand',toZone:'graveyard',instanceId:id});}
function discardCard(state,side,id){return playCard(state,side,id);}
function returnToDeck(state,side,id,{position='bottom'}={}){return transferCard(state,{fromSide:side,fromZone:'hand',toZone:'deck',instanceId:id,position});}
module.exports={ensureInstances,transferCard,summonFromHand,defeatCreature,drawCard,playCard,discardCard,returnToDeck};

},
"./physical-zones.cjs":function(module,exports,require){
'use strict';
// Count real locations once, not metadata aliases or enchantment target references.
function assertUnique(state){const seen=new Map();function add(id,where){if(id==null)return;const key=String(id);if(seen.has(key))throw Error('DUPLICATE_PHYSICAL_ID: '+key+' '+seen.get(key)+' '+where);seen.set(key,where);}
 for(const [cell,p]of state.board.entries())if(p)add(p.sourceInstanceId,'board:'+cell);
 for(const [i,e]of (state.enchantments||[]).entries())add(e.instanceId,'enchantment:'+i);
 for(const side of ['p','c']){for(const zone of ['hand','deck'])for(const [i,card]of (state.private?.[side]?.[zone]||[]).entries())if(typeof card==='object')add(card.instanceId,side+':'+zone+':'+i);for(const [i,card]of (state.players?.[side]?.graveyard||[]).entries())if(typeof card==='object')add(card.instanceId,side+':graveyard:'+i);}
 return true;
}
module.exports={assertUnique};

},
"./board-neighbors.cjs":function(module,exports,require){
'use strict';

function orthogonalCells(cell){
 const row=Math.floor(cell/5),col=cell%5;
 return [row>0?cell-5:null,row<4?cell+5:null,col>0?cell-1:null,col<4?cell+1:null].filter(k=>k!==null);
}
module.exports={orthogonalCells};

},
"./damage-choices.cjs":function(module,exports,require){
'use strict';

// Command resolution is deterministic and staged. Keep the original checkpoint
// server-side, expose the paid state, and replay only on a fresh staging copy.
// Speculative events stay private until the original command settles.
const transactions=new WeakMap();
const clone=value=>JSON.parse(JSON.stringify(value));
class ChoiceRequired extends Error{
 constructor(state,choice){super('GUARDIAN_CHOICE_REQUIRED');this.state=state;this.choice=choice;}
}

function select(state,cell,side,cells,defs){
 if(cells.length<2)return cells[0];
 const tx=transactions.get(defs),choice={type:'guardian',side,cell,choices:cells};
 if(!tx||tx.cursor>=tx.selected.length)throw new ChoiceRequired(state,choice);
 const answer=tx.selected[tx.cursor++];
 if(answer.cell!==cell||answer.side!==side||!cells.includes(answer.to))throw Error('STALE_GUARDIAN_CHOICE');
 return answer.to;
}

function choices(state,side){
 const q=state.server.pendingChoice;
 return q?.type==='guardian'&&q.side===side&&!state.server.gameOver
  ?q.choices.map(to=>({type:'chooseGuardian',side,to})):[];
}

function run(state,request,actor,defs,apply){
 const pending=state.server.pendingChoice,continuing=pending?.type==='guardian';
 if(continuing&&(request.action.type!=='chooseGuardian'||!choices(state,actor).some(a=>a.to===request.action.to)))
  return {ok:false,code:'INVALID_GUARDIAN_CHOICE'};
 if(!continuing&&!state.board.some(p=>defs[p?.type]?.abilities?.includes('guard_damage')))
  return apply(state,request,actor,defs);
 const saved=continuing?state.server.damageReplay:null;
 const base=saved?.base??state,original=saved?.request??request;
 const selected=continuing?[...saved.selected,{cell:pending.cell,side:actor,to:request.action.to}]:[];
 const input=continuing?clone(base):base;
 if(continuing){
  input.revision=state.revision;
  delete input.server.pendingSurrenders;
  delete input.server.surrenderSequence;
 }
 const carrySurrenders=next=>{
  if(continuing)for(const key of ['processedActionIds','surrenderSequence','pendingSurrenders']){
   if(state.server[key]!==undefined)next.server[key]=clone(state.server[key]);
  }
 };
 const scoped={...defs},tx={selected,cursor:0};
 transactions.set(scoped,tx);
 try{
  const result=apply(input,{...original,expectedRevision:input.revision},original.action.side,scoped);
  if(tx.cursor!==selected.length)throw Error('STALE_GUARDIAN_CHOICE');
  if(result.ok)carrySurrenders(result.state);
  return result;
 }catch(error){
  if(!(error instanceof ChoiceRequired))throw error;
  if(selected.length>=256)throw Error('EFFECT_CHAIN_LIMIT');
  const next=error.state;
  next.revision=state.revision+1;
  carrySurrenders(next);
  next.server.pendingChoice=error.choice;
  next.server.damageReplay={base,request:original,selected};
  return {ok:true,revision:next.revision,state:next,events:[],gameOver:false};
 }finally{transactions.delete(scoped);}
}
module.exports={select,choices,run};

},
"./a3-rules.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.A3Rules=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const durations={'バーサーク':3,'マイン':4,'決戦':2,'防御結界':3,'封魔':1,'王の覚醒':3,'恩寵の光':2,'風精霊の加護':3};
const live=e=>e.zone!=='graveyard';
function same(a,b){if(!a||!b||a.kind!==b.kind)return false;if(a.kind==='global')return true;if(a.kind==='cell')return a.k===b.k;if(a.kind==='king')return a.side===b.side;return a.ref&&b.ref?a.ref===b.ref:!!a.instanceId&&a.instanceId===b.instanceId;}
function piece(board,target){return target?.ref?board.find(p=>p===target.ref):board.find(p=>p&&p.sourceInstanceId===target?.instanceId);}
function targetValid(board,t){return !!t&&(t.kind==='global'||t.kind==='king'&&['p','c'].includes(t.side)||t.kind==='cell'&&Number.isInteger(t.k)&&t.k>=0&&t.k<25||t.kind==='creature'&&!!piece(board,t));}
function castValid(board,id,side,t){if(!targetValid(board,t))return false;switch(id){case 'バーサーク':return t.kind==='creature';case 'マイン':return t.kind==='cell'&&!board[t.k];case '防御結界':return t.kind==='cell';case '恩寵の光':case '決戦':return t.kind==='global';case '封魔':return t.kind==='king'&&t.side!==side;case '風精霊の加護':case '王の覚醒':return t.kind==='king'&&t.side===side;default:return false;}}
function stillValid(board,e){return e.cardId==='マイン'?targetValid(board,e.target)&&e.target.kind==='cell':castValid(board,e.cardId,e.controller??e.caster??e.owner,e.target);}
function berserk(enchantments,target){return Math.max(0,...enchantments.filter(e=>live(e)&&e.cardId==='バーサーク'&&same(e.target,target)).map(e=>e.remainingTurns));}
function candidates(enchantments,temporary,target,viewer){const all=enchantments.filter(e=>live(e)&&same(e.target,target));return {public:all.filter(e=>e.cardId==='マイン'?e.owner===viewer:!e.hidden).concat(temporary.filter(e=>e.public!==false&&same(e.target,target))),hidden:all.filter(e=>e.cardId==='マイン'?e.owner!==viewer:!!e.hidden)};}
function choose(c,selected,random){if(c.public.length)return c.public.includes(selected)?{ok:true,effect:selected}:{ok:false,code:'PUBLIC_CHOICE_REQUIRED'};if(selected)return {ok:false,code:'INVALID_EFFECT'};return {ok:true,effect:c.hidden.length?c.hidden[Math.floor(random()*c.hidden.length)]:null};}
// Stateful PRNG: caller keeps seed in authoritative state, never in public projection.
function random(holder){holder.rngState=((holder.rngState??0x6d2b79f5)+0x6d2b79f5)>>>0;let t=holder.rngState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
function mines(enchantments,cell,active){return enchantments.map((e,i)=>({e,i})).filter(({e})=>live(e)&&e.cardId==='マイン'&&e.target?.kind==='cell'&&e.target.k===cell).sort((a,b)=>Number((a.e.controller??a.e.caster??a.e.owner)!==active)-Number((b.e.controller??b.e.caster??b.e.owner)!==active)||a.i-b.i).map(x=>x.e);}
return {stillValid,durations,same,piece,targetValid,castValid,berserk,candidates,choose,random,mines};
});

},
"./effect-events.cjs":function(module,exports,require){
'use strict';
/** Declarative ability subscriptions; no UI or card-name branches in the dispatcher. */
const {damageCreature}=require('./damage-engine.cjs');
const RULES={
 promote_assassin:{on:'creature:moved',role:'mover',run({state,source,context,events}){
  const cell=context.to,rank=Math.floor(cell/5);
  if(rank!==(source.side==='p'?0:4))return;
  state.server.pendingChoice={type:'promotion',side:source.side,cell,instanceId:source.sourceInstanceId,from:'隠密',to:'暗殺者'};
  events.push({type:'choice:requested',choice:'promotion',side:source.side,cell,instanceId:source.sourceInstanceId});
 }}
};
function dispatch(state,type,context,definitions,events){
 if(state.server.gameOver)return;
 const A1=require('./a1-rules.js'),{makePort}=require('./a1-port.cjs');
 const jobs=collect(state,type,context,definitions);
 if(!require('./resolution-boundary.cjs').defer(state,jobs))resolveCollected(state,jobs,definitions,events);
 if(type==='creature:moved'&&context.mover&&require('./effective-rules.js').abilities(context.mover,definitions,state).includes('promote_assassin'))
  RULES.promote_assassin.run({state,source:context.mover,context,events});
}
function collect(state,type,context,defs){
 const A1=require('./a1-rules.js'),E=require('./effective-rules.js'),jobs=A1.collect(type,context,state.board,defs,state);
 for(const [cell,p]of state.board.entries())if(p){const enabled=E.abilities(p,defs,state);for(const [order,t]of (defs[p.type]?.triggers||[]).entries())if(t.on===type&&enabled.includes(t.id)&&(!t.controllerEvent||context.side===p.side)&&(!t.when||t.when(context,p,state)))jobs.push({id:t.id,source:structuredClone(p),controller:p.side,cell,sourceKind:'creature',order,sequence:jobs.length,context:structuredClone(context),unit:t.unit,targets:t.targets?t.targets(context,p,state):t.targetKind==='player'?[{kind:'player',side:p.side}]:[{kind:'creature',instanceId:p.sourceInstanceId}]});}
 if(type==='turn:started')for(const [cell,p]of state.board.entries()){
  if(p?.side===context.side&&p.poisonTurns>0)jobs.push({id:'poison_tick',source:p,controller:p.side,cell,sourceKind:'creature',order:Number.MAX_SAFE_INTEGER,sequence:jobs.length});
 }
 return jobs;
}
function resolveCollected(state,jobs,defs,events){
 const A1=require('./a1-rules.js');if(jobs.length>256)throw Error('EFFECT_CHAIN_LIMIT');
 for(const job of A1.sortTriggers(jobs,state.activeSide)){if(state.server.gameOver)break;require('./resolution-boundary.cjs').observe(defs,'queue-resolve',state);
  if(job.unit){events.push({type:'ability:triggered',ability:job.id,triggerController:job.controller,cell:job.cell,instanceId:job.source.sourceInstanceId});const r=require('./resolution-boundary.cjs').resolveEffectUnit(state,job.unit,{side:job.controller,targets:job.targets},defs);events.push(...r.events);}
  else if(job.id==='poison_tick')require('./creature-status.cjs').tickPoison(state,job.source.sourceInstanceId,defs,events);
  else A1.resolve([job],require('./a1-port.cjs').makePort(state,defs,events));
 }
}
function dispatchGroup(state,group,defs,events){
 if(state.server.gameOver)return;
 const jobs=group.flatMap(event=>collect(state,event.type,event,defs));
 if(!require('./resolution-boundary.cjs').defer(state,jobs))resolveCollected(state,jobs,defs,events);
}
module.exports={dispatch,dispatchGroup,RULES,collect,resolveCollected};

},
"./a1-port.cjs":function(module,exports,require){
'use strict';
const rules=require('./a1-rules.js');
const {damageCreature}=require('./damage-engine.cjs');
function makePort(state,definitions,events){return {
 state:()=>state,definitions,board:()=>state.board,activeSide:()=>state.activeSide,gameOver:()=>!!state.server.gameOver,
 piece:k=>state.board[k],findCreature:id=>state.board.findIndex(p=>p&&p.sourceInstanceId===id),
 trace:e=>record(state,events,e),emit:(type,detail)=>record(state,events,{type,...detail}),
 damageCreature:(cell,amount)=>{const r=damageCreature(state,cell,amount,definitions);for(const e of r.events)record(state,events,e);require('./effect-events.cjs').dispatchGroup(state,r.events,definitions,events);return r},
 damageKing:(side,amount)=>{
  if(state.server.gameOver)return {amount:0,hpLost:0,defeated:state.players[side].kingHp<=0};
  const p=state.players[side];const hit=require('./damage-engine.cjs').damageKing(state,side,amount);
  record(state,events,{type:'king:damaged',side,amount:hit.amount,hp:p.kingHp});
  require('./resolution-boundary.cjs').settleBoundary(state,events,p.kingHp<=0?[{side,reason:'KING_HP_ZERO'}]:[]);
  return hit;
 },
 healKing:(side,amount)=>require('./healing.cjs').recover(state,{kind:'king',side},amount,definitions,events),
 paralyze:id=>require('./creature-status.cjs').paralyze(state,id,events),
 adjustAttack:(id,amount)=>require('./power-query.cjs').adjust(state,id,amount),
 gainAttackMana:side=>{const result=require('./a2-spells.cjs').gainMana(state,side,events);record(state,events,{type:'ability:resolved',ability:'thief_attack_mana',side,before:result.before,after:result.after});}
};}
function record(state,events,e){events.push({...e,stateAtEvent:{pHp:state.players.p.kingHp,cHp:state.players.c.kingHp,mana:state.players.p.mana,maxMana:state.players.p.maxMana}});}
module.exports={makePort};

},
"./healing.cjs":function(module,exports,require){
'use strict';
const Combat=require('./combat-engine.cjs');
const {abilities}=require('./effective-rules.js');

function valid(state,action,defs){
 const {side,target,sourceInstanceId}=action;
 if(state.server.gameOver||state.activeSide!==side||typeof sourceInstanceId!=='string')return false;
 const source=state.board.find(p=>p?.sourceInstanceId===sourceInstanceId);
 if(!source||source.side!==side||!abilities(source,defs,state).includes('heal'))return false;
 const rights=Combat.rights(source,defs,state);
 if(!rights.move||!rights.attack||source.a||source.attacksUsed>0||
    source.actionRestrictions?.some(e=>['activated-prohibited','move-right-prohibited','attack-right-prohibited'].includes(e.kind)))return false;
 if(target?.kind==='king')return target.side===side;
 if(target?.kind!=='creature')return false;
 const piece=state.board.find(p=>p?.sourceInstanceId===target.instanceId);
 return !!piece&&piece.side===side&&piece.hp<defs[piece.type]?.hp;
}

function recover(state,target,amount,defs,events){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('INVALID_HEAL');
 if(state.server.gameOver||amount===0)return false;
 const king=target.kind==='king';
 const recipient=king?state.players[target.side]:state.board.find(p=>p?.sourceInstanceId===target.instanceId);
 if(!recipient)return false;
 const key=king?'kingHp':'hp',before=recipient[key];
 const after=king?before+amount:Math.min(defs[recipient.type].hp,before+amount);
 if(!(after>before))return false;
 recipient[key]=after;
 const event=king?{type:'king:healed',side:target.side,amount:after-before,hp:after}:
  {type:'creature:healed',instanceId:target.instanceId,amount:after-before,hp:after};
 events.push(event);
 require('./effect-events.cjs').dispatch(state,event.type,event,defs,events);
 return true;
}

function apply(state,action,defs){
 if(!valid(state,action,defs))return {ok:false,code:'ILLEGAL_ABILITY'};
 const source=state.board.find(p=>p?.sourceInstanceId===action.sourceInstanceId);
 source.m=true;
 source.a=true;
 source.attacksUsed=Combat.attackLimit(source,defs,state);
 const events=[{type:'creature:ability-used',side:action.side,abilityId:'heal',from:state.board.indexOf(source)}];
 recover(state,action.target,1,defs,events);
 return {ok:true,events};
}
module.exports={valid,recover,apply};

},
"./combat-engine.cjs":function(module,exports,require){
'use strict';
/** Shared combat geometry, read-only queries, and staged command execution. */
const {damageCreature,triggerMine}=require('./damage-engine.cjs');
const {dispatch}=require('./effect-events.cjs');
const A1=require('./a1-rules.js');
const A5=require('./a5-rules.js');
const {makePort}=require('./a1-port.cjs');
const validCell=k=>Number.isInteger(k)&&k>=0&&k<25;
const abilities=(p,defs,state)=>require('./effective-rules.js').abilities(p,defs,state);
function attackLimit(p,defs,state){return !A5.hasRights(p)?0:abilities(p,defs,state).includes('orthros_double_attack')?2:1;}
function used(p,defs,state){return p.attacksUsed??(p.a?attackLimit(p,defs,state):0);}
function canAttack(p,defs,state){return !A1.blocked(p)&&used(p,defs,state)<attackLimit(p,defs,state);}
function pattern(p,defs,kind,state){const d=defs[p.type];if(!d)return [];return require('./effective-rules.js').berserkActive(state,p)?[[-1,0]]:(kind==='attack'?(d.attack||d.move):d.move)||[];}
function pathClear(state,from,dr,dc,p,defs){
 if(!validCell(from)||!p||!Number.isInteger(dr)||!Number.isInteger(dc))return false;
 if(abilities(p,defs,state).includes('flight'))return true;
 const vr=p.side==='p'?dr:-dr,steps=Math.max(Math.abs(vr),Math.abs(dc));
 const straight=vr===0||dc===0||Math.abs(vr)===Math.abs(dc);
 if(!straight)return Boolean(defs[p.type]?.jump||defs[p.type]?.movement?.jump);
 const r=Math.floor(from/5),c=from%5;
 for(let i=1;i<steps;i++){const rr=r+vr*i/steps,cc=c+dc*i/steps;if(!Number.isInteger(rr)||!Number.isInteger(cc)||rr<0||rr>=5||cc<0||cc>=5||state.board[rr*5+cc])return false;}
 return true;
}
function cells(state,from,defs,kind,includeEmpty=false){
 if(!validCell(from))return [];
 const p=state.board[from];if(!p||A1.blocked(p)||!A5.hasRights(p)||kind==='move'&&p.m||kind==='attack'&&!canAttack(p,defs,state))return [];
 const r=Math.floor(from/5),c=from%5,out=[];
 for(const [dr,dc] of pattern(p,defs,kind,state)){
  const vr=p.side==='p'?dr:-dr,nr=r+vr,nc=c+dc;
  if(!Number.isInteger(nr)||!Number.isInteger(nc)||nr<0||nr>=5||nc<0||nc>=5)continue;
  const to=nr*5+nc,target=state.board[to];
  if(kind==='attack'){if(defs[p.type].attackObstructed&&!pathClear(state,from,dr,dc,p,defs))continue;if(includeEmpty&&!target||target&&(p.side!==target.side||abilities(p,defs,state).includes('allow_friendly_attack')||abilities(target,defs,state).includes('allow_friendly_target')))out.push(to);continue;}
  if(target)continue;
  if(pathClear(state,from,dr,dc,p,defs))out.push(to);
 }
 return out;
}
function squares(state,from,defs,kind){return cells(state,from,defs,kind);}
function attackRange(state,from,defs){return cells(state,from,defs,'attack',true);}
function rights(p,defs,state){return {move:!!p&&A5.hasRights(p)&&!p.m&&!A1.blocked(p)&&pattern(p,defs,'move',state).length>0,attack:!!p&&canAttack(p,defs,state)&&pattern(p,defs,'attack',state).length>0};}
function kingReachable(state,from,defs){
 if(!validCell(from))return false;
 const p=state.board[from];if(!p||!A5.hasRights(p)||!canAttack(p,defs,state))return false;
 const r=Math.floor(from/5),c=from%5,kr=p.side==='p'?-1:5;
 return pattern(p,defs,'attack',state).some(([dr,dc])=>r+(p.side==='p'?dr:-dr)===kr&&c+dc>=1&&c+dc<=3&&(!defs[p.type].attackObstructed||pathClear(state,from,dr,dc,p,defs)));
}
function power(state,p,defs){return require('./power-query.cjs').forPiece(state,p,defs)?.total??0;}

function spend(p,defs,state){p.attacksUsed=used(p,defs,state)+1;p.a=!canAttack(p,defs,state);}
function move(state,from,to,defs){
 if(!validCell(from)||!validCell(to)||!squares(state,from,defs,'move').includes(to))return {ok:false,code:'ILLEGAL_MOVE'};
 const p=state.board[from];state.board[to]=p;state.board[from]=null;p.m=true;
 const events=[{type:'creature:moved',from,to,cardId:p.type}];
 require('./a5-entry.cjs').begin(state,to,defs,events);
 return {ok:true,events};
}
function executeAttack(state,from,to,defs){
 const events=[],port=makePort(state,defs,events);port.beforeResolveCollected=(jobs,context)=>defs.$hooks?.beforeResolveCollected?.({state,events,jobs,context});
 port.legal=(f,t)=>validCell(f)&&(t===null?kingReachable(state,f,defs):validCell(t)&&squares(state,f,defs,'attack').includes(t));
 port.power=p=>power(state,p,defs);port.spend=p=>spend(p,defs,state);
 const result=A1.attack(port,from,to);
 const declaration=events.find(e=>e.type==='creature:attacked'),resolution=result?{rawAmount:declaration?.amount??0,amount:result.interrupted?0:result.amount??0,reduction:result.reduction??0,interrupted:!!result.interrupted,defeated:!!result.defeated}:null;
 return result?{...result,ok:true,events,resolution}:{ok:false,code:to===null?'ILLEGAL_KING_ATTACK':'ILLEGAL_ATTACK'};
}
function attackCreature(state,from,to,defs){return executeAttack(state,from,to,defs);}
function attackKing(state,from,defs){return executeAttack(state,from,null,defs);}
module.exports={squares,attackRange,pattern,pathClear,rights,kingReachable,power,attackLimit,canAttack,spend,move,attackCreature,attackKing};

},
"./a5-rules.js":function(module,exports,require){
/* A5 shared legality. Permission keys are extension points, not new card abilities. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.A5Rules=f();})(globalThis,function(){
'use strict';
const abilities=(p,d)=>d[p.type]?.abilities||[];
function hasRights(p){return p.type!=='バリケード';}
function attackLimit(p,d){return !hasRights(p)?0:abilities(p,d).includes('orthros_double_attack')?2:1;}
function targetAllowed(p,q,d){return !!q&&(p.side!==q.side||abilities(p,d).includes('allow_friendly_attack')||abilities(q,d).includes('allow_friendly_target'));}
function entryJobs(piece,cell,mines,activeSide,summon=false){
 const jobs=mines.map((e,i)=>({kind:'mine',controller:e.controller??e.owner,instanceId:e.instanceId,sequence:i}));
 if(summon&&piece.type==='守備兵')jobs.push({kind:'guard',controller:piece.side,sequence:jobs.length});
 if(!summon&&piece.type==='隠密'&&Math.floor(cell/5)===(piece.side==='p'?0:4))jobs.push({kind:'promotion',controller:piece.side,sequence:jobs.length});
 return jobs.sort((a,b)=>(a.controller===activeSide?0:1)-(b.controller===activeSide?0:1)||(a.kind==='mine'?1:0)-(b.kind==='mine'?1:0)||a.sequence-b.sequence);
}
return {hasRights,attackLimit,targetAllowed,entryJobs};
});

},
"./power-query.cjs":function(module,exports,require){
'use strict';
// Pure current-ATK calculation, shared by execution and read APIs. No state/ID allocation.
const cell=k=>Number.isInteger(k)&&k>=0&&k<25,identity=p=>p?.sourceInstanceId??p?.instanceId;
function locate(board,p){const ref=board.indexOf(p);if(ref>=0)return ref;const id=identity(p);if(id==null)return -1;const found=board.flatMap((q,k)=>q&&identity(q)!=null&&String(identity(q))===String(id)?[k]:[]);return found.length===1?found[0]:-1;}
function active(e){return e&&(!e.zone||['attached','global'].includes(e.zone))&&(e.remainingTurns==null||Number.isInteger(e.remainingTurns)&&e.remainingTurns>0);}
function calculate(state,p,from,defs,mode){
 const E=require('./effective-rules.js'),board=state.board,has=(q,id)=>E.abilities(q,defs,state).includes(id),all=state.enchantments||[];
 const related=all.filter(e=>e.cardId==='バーサーク'&&e.target?.kind==='creature'&&(e.target.ref===p||identity(p)!=null&&(e.target.instanceId??identity(e.target.ref))!=null&&String(e.target.instanceId??identity(e.target.ref))===String(identity(p))));
 // Old low-level fixtures/state may carry only the derived berserk duration, without card records.
 const berserk=E.berserkActive(state,p);
 const base=Number.isFinite(p.atk)?p.atk:Number.isFinite(defs[p.type]?.atk)?defs[p.type].atk:0,multiplier=berserk?1.5:1;
 const allies=board.filter((q,k)=>q&&k!==from&&q.side===p.side),dancer=allies.filter(q=>has(q,'dancer_aura')).length,pack=has(p,'war_wolf_pack')?allies.length:0;
 const battles=all.filter(e=>e.cardId==='決戦'&&active(e)&&E.enabled(state,p,'battle_bonus','modifier',e.instanceId));
 const modifiers=(state.modifiers||[]).filter(m=>(m.subjectId==null||String(m.subjectId)===String(identity(p)))&&(m.sourceId==null||board.some(q=>q&&String(identity(q))===String(m.sourceId))||all.some(e=>String(e.instanceId)===String(m.sourceId)&&active(e)))&&E.enabled(state,p,m.abilityId||'atk_modifier','modifier',m.sourceId));const multipliedBase=berserk?Math.ceil(base*multiplier):base,growth=p.atkGrowth||0,total=Math.max(0,E.numeric(multipliedBase,1,battles.length+dancer+pack+growth,modifiers));
 return {mode,base,multiplier,multipliedBase,battle:battles.length,dancer,pack,...(growth?{growth}:{}),total,battleTurns:battles.map(e=>e.remainingTurns??null)};
}
function query(state,selection,defs){
 if(!Array.isArray(state?.board)||state.board.length!==25)return null;
 const {kind}=selection||{};
 if(kind==='board'){const k=selection.piece?locate(state.board,selection.piece):selection.cell;if(!cell(k)||!state.board[k])return null;return calculate(state,state.board[k],k,defs,'board');}
 if(kind==='preview'){const p=selection.piece;if(!p||!['p','c'].includes(p.side))return null;return calculate(state,p,-1,defs,'preview');}
 if(kind==='virtual'){const {from,to}=selection;if(!cell(from)||!cell(to)||!state.board[from]||from!==to&&state.board[to])return null;const board=state.board.slice(),p={...board[from]};board[from]=null;board[to]=p;return calculate({...state,board},p,to,defs,'virtual');}
 return null;
}
function forPiece(state,p,defs){if(!p)return null;const k=locate(state.board,p);if(k<0&&identity(p)!=null&&state.board.some(q=>q&&identity(q)!=null&&String(identity(q))===String(identity(p))))return null;return query(state,k>=0?{kind:'board',cell:k}:{kind:'preview',piece:p},defs);}
function adjust(state,id,amount){
 if(typeof id!=='string')return false;
 const piece=state.board.find(p=>p?.sourceInstanceId===id);
 if(!piece)return false;
 piece.atkGrowth=(piece.atkGrowth||0)+amount;
 return true;
}
module.exports={query,forPiece,active,adjust};

},
"./a5-entry.cjs":function(module,exports,require){
'use strict';
const A5=require('./a5-rules.js'),A3=require('./a3-rules.js');
const {triggerMine}=require('./damage-engine.cjs');
function entryJobs(state,cell,defs,summon){
 const p=state.board[cell],abilities=require('./effective-rules.js').abilities(p,defs,state);
 const jobs=A5.entryJobs(p,cell,A3.mines(state.enchantments,cell,state.activeSide),state.activeSide,summon)
  .filter(j=>j.kind==='mine'||abilities.includes(j.kind==='promotion'?'promote_assassin':'guard_barricade'));
 const evolution=defs[p.type]?.evolution;
 const ownRank=p.side==='p'?4:0;
 if(!summon&&evolution&&Math.floor(cell/5)===(evolution.rank==='own'?ownRank:4-ownRank))
  jobs.push({kind:'evolution',controller:p.side,from:p.type,to:evolution.to,sequence:jobs.length});
 return require('./a1-rules.js').sortTriggers(jobs.map(j=>({...j,cell,entryInstanceId:p.sourceInstanceId,sourceKind:j.kind==='mine'?'cell':'creature',order:0})),state.activeSide);
}
function begin(state,cell,defs,events,summon=false){
 const p=state.board[cell];if(!p||state.server.gameOver)return;
 const jobs=entryJobs(state,cell,defs,summon);
 if(!jobs.length)return;
 state.server.pendingEntry={cell,instanceId:p.sourceInstanceId,jobs};
 resume(state,defs,events);
}
function beginMany(state,cells,defs,events){
 const sorted=require('./a1-rules.js').sortTriggers(cells.flatMap(cell=>state.board[cell]?entryJobs(state,cell,defs,false):[]),state.activeSide);
 if(!sorted.length)return;
 state.server.pendingEntry={cell:sorted[0].cell,instanceId:sorted[0].entryInstanceId,jobs:sorted};resume(state,defs,events);
}
function resume(state,defs,events){
 const q=state.server.pendingEntry;if(!q)return;
 while(q.jobs.length&&!state.server.gameOver){
  const job=q.jobs.shift();if(job.cell!=null){q.cell=job.cell;q.instanceId=job.entryInstanceId;}const p=state.board[q.cell];
  const present=p&&p.sourceInstanceId===q.instanceId;
  if(job.kind==='guard'){
   const col=q.cell%5,choices=[q.cell-1,q.cell+1].filter(k=>k>=0&&k<25&&Math.floor(k/5)===Math.floor(q.cell/5)&&!state.board[k]);
   if(choices.length){state.server.pendingSummon={side:job.controller,cell:q.cell,sourceInstanceId:q.instanceId,choices};if(choices.length===1){const result=require('./summon-triggers.cjs').resolveBarricadeChoice(state,job.controller,choices[0],defs);events.push(...result.events);}else events.push({type:'summon:choice-required',side:job.controller,cell:q.cell,choices});return;}
   events.push({type:'summon:ability-no-space',cell:q.cell});continue;
  }
  if(job.kind==='evolution'){
   if(present&&p.type===job.from&&p.side===job.controller)require('./a1-state.cjs').promote(state,q.cell,job.to,defs,events);
   continue;
  }
  if(job.kind==='promotion'){
   if(!present||p.type!=='隠密')continue;
   state.server.pendingChoice={type:'promotion',side:job.controller,cell:q.cell,instanceId:q.instanceId,from:'隠密',to:'暗殺者'};
   events.push({type:'choice:requested',choice:'promotion',side:job.controller,cell:q.cell,instanceId:q.instanceId});return;
  }
  const mine=state.enchantments.find(e=>e.instanceId===job.instanceId);
  if(mine){const r=triggerMine(state,q.cell,defs,[mine],q.instanceId);events.push(...r.events);state.server.pendingEntry=q;}
 }
 delete state.server.pendingEntry;
}
module.exports={begin,beginMany,resume};

},
"./summon-triggers.cjs":function(module,exports,require){
'use strict';
/** Existing HTML ordering: creature:summoned -> enterSquare (mine) -> resolveSummonAbilities. */
const {triggerMine}=require('./damage-engine.cjs');
function resolveSummonTriggers(state,cell,definitions){const events=[];require('./a5-entry.cjs').begin(state,cell,definitions,events,true);return {events};}
function resolveBarricadeChoice(state,side,cell,definitions){
 const pending=state.server.pendingSummon;
 if(!pending||pending.side!==side||!pending.choices.includes(cell))return {ok:false,code:'INVALID_TOKEN_CHOICE'};
 const origin=state.board[pending.cell];
 if(state.board[cell]!==null)return {ok:false,code:'STALE_TOKEN_CHOICE'};
 const def=definitions['バリケード'];if(!def||!def.token)return {ok:false,code:'TOKEN_DEFINITION_MISSING'};
 delete state.server.pendingSummon;
 const events=[];
 generateToken(state,side,cell,'バリケード',definitions,events);
 events.push(...triggerMine(state,cell,definitions).events);
 require('./a5-entry.cjs').resume(state,definitions,events);
 return {ok:true,events};
}
function generateToken(state,side,cell,cardId,defs,events){
 const def=defs[cardId];
 if(!def||state.board[cell]!==null)throw Error('INVALID_TOKEN_PLACEMENT');
 state.server.nextTokenId=(state.server.nextTokenId||0)+1;
 state.board[cell]={sourceInstanceId:'token-'+state.server.nextTokenId,type:cardId,atk:def.atk,hp:def.hp,owner:side,side,m:!!def.token,a:!!def.token,attacksUsed:0,...(!def.token?{generatedToken:true}:{})};
 events.push({type:'creature:summoned',side,cell,cardId,token:true});
}
module.exports={resolveSummonTriggers,resolveBarricadeChoice,generateToken};

},
"./a1-state.cjs":function(module,exports,require){
'use strict';
const rules=require('./a1-rules.js');
const {damageCreature}=require('./damage-engine.cjs');
function changeController(state,cell,next,events=[],definitions={}){
 const piece=state.board[cell];if(state.server.gameOver)return false;
 const event=rules.changeController(piece,next);if(!event)return false;
 finishChange(state,cell,event,definitions,events);return true;
}
function applyBetrayalEffect(state,cell,caster,events=[],definitions={}){
 const piece=state.board[cell];if(!piece||!changeController(state,cell,piece.side==='p'?'c':'p',events,definitions))return false;
 state.server.nextEffectId=(state.server.nextEffectId||0)+1;
 rules.restrict(piece,caster,'restriction-'+state.server.nextEffectId);return true;
}
function promote(state,cell,to,definitions,events=[]){
 const p=state.board[cell];if(!p||state.server.gameOver)return false;
 const event=rules.transform(p,definitions[p.type],definitions[to],to);
 if(event.lethal)events.push(...damageCreature(state,cell,0,definitions).events.filter(e=>e.type!=='creature:damaged'));
 finishChange(state,cell,{...event,instanceId:p.sourceInstanceId},definitions,events);
 if(state.board[cell]?.sourceInstanceId===p.sourceInstanceId&&definitions[to].onEvolution==='defeat_enemy_king')
  require('./a2-spells.cjs').zeroKingHp(state,p.side==='p'?'c':'p',events,'evolution');
 return true;
}
function finishChange(state,cell,event,defs,events){
 const B=require('./resolution-boundary.cjs');B.observe(defs,'updated',state);
 require('./enchantment-lifecycle.cjs').revalidate(state,events);B.observe(defs,'revalidated',state);
 const p=state.board[cell];const current=p&&defs[p.type]?require('./power-query.cjs').query(state,{kind:'board',cell},defs):null;
 if(p)event.after=JSON.parse(JSON.stringify(p));B.observe(defs,'recalculated',state);
 const detail={...event,cell,...(current?{currentPower:current.total}:{})};events.push(detail);
 B.observe(defs,'collect',state);require('./effect-events.cjs').dispatch(state,event.type,detail,defs,events);
}
module.exports={changeController,applyBetrayalEffect,promote};

},
"./a2-spells.cjs":function(module,exports,require){
'use strict';
const A2=require('./a2-rules.js');
const {ensureInstances,playCard}=require('./card-zones.cjs');
function gainMana(state,side,events=[]){
 const result=require('./mana-delta.cjs').applyManaDelta(state,side,{maxDelta:1,availableDelta:1},events,'card-or-attack');if(!result.ok)throw Error(result.code);return {before:result.before,after:result.after};
}
function zeroKingHp(state,target,events,reason){
 if(state.server.gameOver)return;
 const before=state.players[target].kingHp;
 state.players[target].kingHp=0;
 events.push({type:'king:hp-set',side:target,before,after:0,reason});
 require('./resolution-boundary.cjs').settleBoundary(state,events,[],{unitBoundary:true});
}
function pressureEffect(state,side,countAtCommit,events=[]){
 return A2.pressure({gameOver:()=>!!state.server.gameOver,setKingHpZero:target=>zeroKingHp(state,target,events,'pressure')},side,countAtCommit);
}
function cast(state,action,definitions){
 const side=action.side,def=definitions[action.cardId];
 if(!['マナ','圧殺'].includes(action.cardId))return {ok:false,code:'ACTION_NOT_IMPLEMENTED'};
 if(!def||def.type!=='spell'||!Number.isSafeInteger(def.cost)||def.cost<0)return {ok:false,code:'INVALID_SPELL'};
 if(state.server.gameOver)return {ok:false,code:'GAME_OVER'};
 if(side!==state.activeSide)return {ok:false,code:'NOT_YOUR_TURN'};
 if(state.enchantments.some(e=>e.cardId==='封魔'&&e.zone!=='graveyard'&&e.target?.kind==='king'&&e.target.side===side))return {ok:false,code:'SPELLS_BLOCKED'};
 if(!require('./target-queries.cjs').cardValid(state,action,definitions))return {ok:false,code:'INVALID_TARGET'};
 if(state.players[side].mana<def.cost)return {ok:false,code:'INSUFFICIENT_MANA'};
 // action-bridge supplies a staged state. Resolve the physical card before payment.
 ensureInstances(state);
 const matches=state.private[side].hand.filter(c=>c.cardId===action.cardId),card=action.instanceId?matches.find(c=>c.instanceId===action.instanceId):matches.length===1?matches[0]:null;
 if(!card)return {ok:false,code:matches.length>1&&!action.instanceId?'AMBIGUOUS_CARD':'CARD_NOT_IN_HAND'};
 const countAtCommit=A2.controlledCount(state.board,side),events=[];
 playCard(state,side,card.instanceId);state.players[side].mana-=def.cost;
 events.push({type:'card:played',side,cardId:action.cardId,instanceId:card.instanceId});
 if(action.cardId==='マナ'){const unit=require('./resolution-boundary.cjs').resolveEffectUnit(state,{unitId:'mana',mode:'sequential',targetPolicy:'valid-only',operations:[{kind:'mana',side,delta:{maxDelta:1,availableDelta:1}}]},{side,targets:[]},definitions);events.push(...unit.events);}
 else {const result=pressureEffect(state,side,countAtCommit,events);events.push({type:'pressure:resolved',side,...result});}
 return {ok:true,events};
}
module.exports={gainMana,pressureEffect,zeroKingHp,cast};

},
"./a2-rules.js":function(module,exports,require){
/* Shared A2 rules: mana gains and direct king HP assignment are distinct from damage. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.A2Rules=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
function gainMana(maxMana,mana){return {maxMana:Math.min(10,maxMana+1),mana:Math.min(10,mana+1)};}
function controlledCount(board,side){return board.filter(p=>p&&p.side===side).length;}
function pressure(port,caster,countAtCommit){
 if(port.gameOver())return {success:false,stopped:true,countAtCommit};
 const target=caster==='p'?'c':'p',success=countAtCommit>=10;
 if(success)port.setKingHpZero(target);
 return {success,countAtCommit,target};
}
return {gainMana,controlledCount,pressure};
});

},
"./target-queries.cjs":function(module,exports,require){
'use strict';
// Shared read-only legality. Results contain only actor-owned hand IDs and public targets.
const A3=require('./a3-rules.js'),C=require('./combat-engine.cjs'),K=require('./a5r1-abilities.js');
const side=s=>s==='p'||s==='c',cell=k=>Number.isInteger(k)&&k>=0&&k<25;
const creature=(s,t)=>t?.kind==='creature'?s.board.findIndex(p=>p&&p.sourceInstanceId===t.instanceId):-1;
function blocked(s,a,r){const v=s.server||{};return !side(a)||a!==s.activeSide||v.gameOver||v.pendingChoice||v.pendingSummon||v.pendingEntry||v.effectQueue?.length||Object.keys(v.pendingCardTransfers||{}).length||r?.resolving||r?.queue?.length||r?.summonQueue?.length;}
function sealed(s,a){return s.enchantments.some(e=>e.cardId==='封魔'&&e.zone!=='graveyard'&&e.target?.kind==='king'&&e.target.side===a);}
function summonValid(s,a,d){return !!d&&d.type==='creature'&&!d.token&&d.deckType!=='transform'&&cell(a.to)&&Math.floor(a.to/5)===(a.side==='p'?4:0)&&!s.board[a.to];}
function cardValid(s,a,defs){
 const d=defs[a.cardId],t=a.target;if(!d)return false;if(d.effectUnit)return require('./resolution-boundary.cjs').declarationValid(s,a,d.effectUnit);
 if(d.type==='creature')return summonValid(s,a,d);
 if(d.type==='enchant')return A3.castValid(s.board,a.cardId,a.side,t);
 if(d.type!=='spell')return false;
 const i=creature(s,t),king=t?.kind==='king'&&side(t.side);
 if(d.creaturePair)return require('./swap-spell.cjs').valid(s,a,d.creaturePair);
 if(d.targetKind==='cell')return t?.kind==='cell'&&cell(t.k);
 if(d.targetKind==='creature')return i>=0;
 switch(a.cardId){
 case '突風':case '竜巻':return require('./wind-spells.cjs').valid(s,a);
 case 'マナ':return t==null;
 case 'ホープ':return t?.kind==='player'&&side(t.side);
 case '圧殺':return king&&t.side!==a.side;
 case 'ファイヤーボルト':return king||i>=0;
 case '裏切り':return i>=0;
 case '転移魔法':return i>=0&&cell(a.to)&&a.to!==i&&!s.board[a.to];
 case '解呪':return A3.targetValid(s.board,t);
 default:return false;
 }
}
function abilityPort(s,defs){return {gameOver:()=>!!s.server.gameOver,activeSide:()=>s.activeSide,piece:k=>s.board[k],abilities:p=>require('./effective-rules.js').abilities(p,defs,s),remaining:p=>C.attackLimit(p,defs,s)-(p.attacksUsed??(p.a?C.attackLimit(p,defs,s):0)),mana:a=>s.players[a].mana,validTarget:t=>t?.kind==='king'?side(t.side):t?.kind==='creature'&&!!s.board[t.cell],awakened:a=>s.enchantments.some(e=>e.cardId==='王の覚醒'&&e.zone!=='graveyard'&&e.target?.kind==='king'&&e.target.side===a&&require('./effective-rules.js').enabled(s,{sourceInstanceId:'king:'+a},'awaken_attack','activated',e.instanceId)),kingUsed:a=>s.server.kingAction?.[a]?.awaken_attack||0};}
function abilityValid(s,a,defs){const paid=require('./paid-creature-abilities.cjs');if(Object.hasOwn(paid.rules,a.abilityId))return paid.valid(s,a,defs);if(a.abilityId==='heal')return require('./healing.cjs').valid(s,a,defs);if(a.abilityId==='royal_wind')return require('./royal-wind.cjs').valid(s,a);const piece=s.board.find(p=>p?.sourceInstanceId===a.sourceInstanceId),limit=defs[piece?.type]?.abilityLimits?.[a.abilityId];if(piece&&limit!=null&&(piece.abilityUses?.[a.abilityId]||0)>=limit)return false;const port=abilityPort(s,defs),from=s.board.findIndex(p=>p?.sourceInstanceId===a.sourceInstanceId),t=a.target?.kind==='creature'?{kind:'creature',cell:creature(s,a.target)}:a.target;return a.abilityId==='sorcerer_bolt'?K.canBolt(port,a.side,from,t):a.abilityId==='awaken_attack'?K.canAwaken(port,a.side,t):false;}
function regions(s){return [...s.board.flatMap(p=>p?[{kind:'creature',instanceId:p.sourceInstanceId}]:[]),...Array.from({length:25},(_,k)=>({kind:'cell',k})),{kind:'king',side:'p'},{kind:'king',side:'c'},{kind:'player',side:'p'},{kind:'player',side:'c'},{kind:'global'}];}
function effectChoices(s,target,viewer){return require('./a3-actions.cjs').candidates(s,target,viewer).public.map(e=>({effectId:String(e.instanceId??e.id),cardId:e.cardId??null,remainingTurns:e.remainingTurns,kind:e.temporary?e.kind??'temporary':'enchantment'}));}
function queryCard(s,actor,selection,defs,runtime,options={}){
 const d=defs[selection?.cardId],hand=s.private?.[actor]?.hand||[];
 const matches=hand.filter(c=>c.cardId===selection?.cardId),card=selection?.instanceId?matches.find(c=>c.instanceId===selection.instanceId):matches.length===1?matches[0]:null;
 const empty={stage:'unavailable',choices:[]};
 if(!side(actor)||!d||!card)return empty;
 if(!options.preview&&(blocked(s,actor,runtime)||s.players[actor].mana<d.cost||d.type==='spell'&&sealed(s,actor)))return empty;
 const base={side:actor,cardId:card.cardId,instanceId:card.instanceId,type:d.type==='creature'?'summon':d.type==='enchant'?'play_enchant':'play_spell'};
 if(d.type==='creature')return {stage:'target',choices:Array.from({length:25},(_,to)=>({...base,to})).filter(a=>cardValid(s,a,defs))};
 if(selection.cardId==='マナ')return {stage:'none',choices:[base]};
 if(d.creaturePair)return require('./swap-spell.cjs').query(s,selection,base,d.creaturePair);
 if(selection.cardId==='転移魔法'){
  if(selection.sourceInstanceId==null)return {stage:'source',choices:s.board.flatMap(p=>p?[{target:{kind:'creature',instanceId:p.sourceInstanceId}}]:[])};
  const target={kind:'creature',instanceId:selection.sourceInstanceId};
  return {stage:'destination',choices:Array.from({length:25},(_,to)=>({...base,target,to})).filter(a=>cardValid(s,a,defs))};
 }
 if(selection.cardId==='解呪'&&selection.target){
  if(!A3.targetValid(s.board,selection.target))return empty;
  const choices=effectChoices(s,selection.target,actor);
  return {stage:'effect',choices:choices.length?choices.map(e=>({...base,target:{...selection.target},effectId:e.effectId})):[{...base,target:{...selection.target}}]};
 }
 return {stage:'target',choices:regions(s).map(target=>({...base,target})).filter(a=>cardValid(s,a,defs))};
}
function queryAbility(s,actor,selection,defs,runtime,options={}){
 if(!side(actor)||!selection)return [];
 if(!options.preview&&blocked(s,actor,runtime))return [];
 return regions(s).map(target=>({type:'activate_ability',side:actor,abilityId:selection?.abilityId,sourceInstanceId:selection?.sourceInstanceId,target})).filter(a=>abilityValid(s,a,defs));
}
module.exports={blocked,sealed,summonValid,cardValid,abilityValid,queryCard,queryAbility,effectChoices};

},
"./a5r1-abilities.js":function(module,exports,require){
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.A5R1Abilities=f();})(globalThis,function(){
'use strict';
function canBolt(port,side,from,target){
 const p=port.piece(from),restrictions=p?.actionRestrictions||[];
 if(port.gameOver()||port.activeSide()!==side||!p||p.side!==side||!port.abilities(p).includes('sorcerer_bolt')||port.remaining(p)<1||port.mana(side)<2||restrictions.some(e=>['move-attack-prohibited','activated-prohibited','attack-right-prohibited'].includes(e.kind)))return false;
 if(!port.validTarget(target))return false;
 return true;
}
function bolt(port,side,from,target){
 if(!canBolt(port,side,from,target))return false;
 const p=port.piece(from);
 port.pay(side,2);port.spend(p);port.damage(target,2);port.emit('creature:ability-used',{side,abilityId:'sorcerer_bolt',from,target});return true;
}
function canAwaken(port,side,target){
 if(port.gameOver()||port.activeSide()!==side||!port.awakened(side)||port.kingUsed(side)>=1||target?.kind!=='creature')return false;
 const p=port.piece(target.cell);
 if(!p||p.side===side||Math.floor(target.cell/5)!==(side==='p'?4:0))return false;
 return true;
}
function awaken(port,side,target){
 if(!canAwaken(port,side,target))return false;
 const p=port.piece(target.cell);
 port.spendKing(side);port.emit('king:attack-targeted',{side,abilityId:'awaken_attack',cell:target.cell});
 if(port.gameOver())return true;
 if(port.piece(target.cell)===p)port.damage(target,5);
 port.emit('king:ability-used',{side,abilityId:'awaken_attack',cell:target.cell});return true;
}
return {bolt,awaken,canBolt,canAwaken};
});

},
"./swap-spell.cjs":function(module,exports,require){
 'use strict';
const index=(s,id)=>typeof id==='string'?s.board.findIndex(p=>p?.sourceInstanceId===id):-1;
function legalPair(first,second,actor,rule){
 return !!first&&!!second&&first!==second&&(rule!=='opposed'||first.side===actor&&second.side!==actor);
}
function valid(s,a,rule){
 const first=a.target?.kind==='creature'?index(s,a.target.instanceId):-1;
 return legalPair(s.board[first],s.board[index(s,a.sourceInstanceId)],a.side,rule);
}
function query(s,selection,base,rule){
 const units=s.board.filter(Boolean);if(units.length<2)return {stage:'unavailable',choices:[]};
 if(selection.sourceInstanceId==null){
  const choices=units.filter(p=>units.some(q=>legalPair(p,q,base.side,rule))).map(p=>({target:{kind:'creature',instanceId:p.sourceInstanceId}}));
  return {stage:choices.length?'source':'unavailable',choices};
 }
 if(index(s,selection.sourceInstanceId)<0)return {stage:'unavailable',choices:[]};
 const target={kind:'creature',instanceId:selection.sourceInstanceId};
 return {stage:'secondCreature',choices:units.filter(p=>legalPair(s.board[index(s,selection.sourceInstanceId)],p,base.side,rule)).map(p=>({...base,target,sourceInstanceId:p.sourceInstanceId}))};
}
function resolve(s,a,defs,events){
 const first=index(s,a.target.instanceId),second=index(s,a.sourceInstanceId);
 if(!valid(s,a))throw Error('INVALID_TARGET');
 const one=s.board[first],two=s.board[second];s.board[first]=two;s.board[second]=one;
 events.push({type:'creature:moved',from:first,to:second,bySpell:true},{type:'creature:moved',from:second,to:first,bySpell:true});
 require('./a5-entry.cjs').beginMany(s,[first,second],defs,events);
}
function destroyPair(s,a,defs,events){
 if(!valid(s,a,'opposed'))throw Error('INVALID_TARGET');
 const cells=[index(s,a.target.instanceId),index(s,a.sourceInstanceId)];
 const deaths=require('./damage-engine.cjs').destroyCreatures(s,cells,defs);
 events.push(...deaths);
 require('./effect-events.cjs').dispatchGroup(s,deaths,defs,events);
}
module.exports={valid,query,resolve,destroyPair};

},
"./wind-spells.cjs":function(module,exports,require){
'use strict';
const cell=k=>Number.isInteger(k)&&k>=0&&k<25;
function destinations(state,from,side,cardId){
 if(!cell(from)||!state.board[from])return [];
 const row=Math.floor(from/5),col=from%5,steps=cardId==='突風'?[[side==='p'?-1:1,0]]:[[-1,0],[1,0],[0,-1],[0,1]];
 return steps.flatMap(([dr,dc])=>{const r=row+dr,c=col+dc,to=r*5+c;return r>=0&&r<5&&c>=0&&c<5&&!state.board[to]?[to]:[];});
}
function valid(state,action){const i=action.target?.kind==='creature'?state.board.findIndex(p=>p?.sourceInstanceId===action.target.instanceId):-1;return i>=0&&(action.cardId==='竜巻'||destinations(state,i,action.side,action.cardId).length>0);}
// Effect relocation preserves all rights/history. Entry effects use the teleport route.
function relocate(state,from,to,defs,events,bySpell=true){state.board[to]=state.board[from];state.board[from]=null;events.push({type:'creature:moved',from,to,bySpell});require('./a5-entry.cjs').begin(state,to,defs,events);}
function resolve(state,action,defs,events){
 let from=state.board.findIndex(p=>p?.sourceInstanceId===action.target.instanceId);
 if(action.cardId==='突風'){relocate(state,from,destinations(state,from,action.side,action.cardId)[0],defs,events);return;}
 const unit=require('./resolution-boundary.cjs').resolveEffectUnit(state,{unitId:'tornado-damage',mode:'sequential',targetPolicy:'valid-only',operations:[{kind:'damage',amount:1}]},{side:action.side,targets:[action.target]},defs);events.push(...unit.events);
 if(state.server.gameOver)return;
 from=state.board.findIndex(p=>p?.sourceInstanceId===action.target.instanceId);if(from<0)return;
 const choices=destinations(state,from,action.side,'竜巻');
 if(choices.length)state.server.pendingChoice={type:'effectMove',side:action.side,cardId:'竜巻',instanceId:action.target.instanceId,cell:from,choices};
}
function choices(state,side){const q=state.server.pendingChoice;if(q?.type!=='effectMove'||q.side!==side||state.server.gameOver)return [];const from=state.board.findIndex(p=>p?.sourceInstanceId===q.instanceId);return destinations(state,from,side,q.cardId).filter(k=>q.choices.includes(k)).map(to=>({type:'chooseEffectCell',side,to}));}
function choose(state,action,defs,events){const q=state.server.pendingChoice;if(!choices(state,action.side).some(a=>a.to===action.to))return {ok:false,code:'INVALID_EFFECT_DESTINATION'};const from=state.board.findIndex(p=>p?.sourceInstanceId===q.instanceId);delete state.server.pendingChoice;relocate(state,from,action.to,defs,events);return {ok:true};}
module.exports={destinations,valid,resolve,choices,choose,relocate};

},
"./paid-creature-abilities.cjs":function(module,exports,require){
'use strict';
const Combat=require('./combat-engine.cjs');
const {abilities}=require('./effective-rules.js');
const rules={fortune_draw:{mana:2,move:false},generate_golem:{mana:4,move:true}};
function valid(state,action,defs){
 const {side,target,sourceInstanceId,abilityId}=action;
 const rule=rules[abilityId];
 if(!rule||state.server.gameOver||state.activeSide!==side||typeof sourceInstanceId!=='string'||state.players[side].mana<rule.mana)return false;
 const from=state.board.findIndex(p=>p?.sourceInstanceId===sourceInstanceId),source=state.board[from];
 if(!source||source.side!==side||!abilities(source,defs,state).includes(abilityId))return false;
 const rights=Combat.rights(source,defs,state);
 if(!rights.attack||rule.move&&(!rights.move||source.a||source.attacksUsed>0)||
    source.actionRestrictions?.some(e=>e.kind==='activated-prohibited'||e.kind==='attack-right-prohibited'||rule.move&&e.kind==='move-right-prohibited'))return false;
 if(!rule.move)return target?.kind==='player'&&target.side===side;
 const to=target?.k;
 return target?.kind==='cell'&&Number.isInteger(to)&&to>=0&&to<25&&!state.board[to]&&
  Math.abs(Math.floor(from/5)-Math.floor(to/5))+Math.abs(from%5-to%5)===1;
}
function apply(state,action,defs){
 if(!valid(state,action,defs))return {ok:false,code:'ILLEGAL_ABILITY'};
 const {side,abilityId,target,sourceInstanceId}=action,rule=rules[abilityId];
 const from=state.board.findIndex(p=>p?.sourceInstanceId===sourceInstanceId),source=state.board[from];
 state.players[side].mana-=rule.mana;
 Combat.spend(source,defs,state);
 const events=[{type:'creature:ability-used',side,abilityId,from}];
 if(rule.move){
  source.m=true;
  require('./summon-triggers.cjs').generateToken(state,side,target.k,defs[source.type].generatedCreature,defs,events);
  require('./a5-entry.cjs').begin(state,target.k,defs,events,true);
 }else require('./match-rules.cjs').draw(state,side,1,abilityId,events,defs);
 return {ok:true,events};
}
module.exports={rules,valid,apply};

},
"./match-rules.cjs":function(module,exports,require){
'use strict';
const DEFAULTS=Object.freeze({version:1,secondPlayerInitialManaBonus:0,firstPlayerFirstDraw:false,initialHandSize:5,normalDrawCount:1,handLimit:null});
function normalize(input){
 if(input==null)return {...DEFAULTS};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(DEFAULTS,k)))throw Error('INVALID_RULES');
 const r={...DEFAULTS,...input};if(r.version!==1)throw Error('UNSUPPORTED_RULES_VERSION');
 if(typeof r.firstPlayerFirstDraw!=='boolean')throw Error('INVALID_RULES');
 for(const k of ['secondPlayerInitialManaBonus','initialHandSize','normalDrawCount'])if(!Number.isSafeInteger(r[k])||r[k]<0||(k==='secondPlayerInitialManaBonus'&&r[k]>9))throw Error('INVALID_RULES');
 if(r.handLimit!==null&&(!Number.isSafeInteger(r.handLimit)||r.handLimit<0))throw Error('INVALID_RULES');return r;
}
function get(s){const rules=normalize(s.server?.rules);if(s.server?.rulesKey!=null&&s.server.rulesKey!==JSON.stringify(rules))throw Error('MATCH_RULES_CHANGED');return rules;}
function attach(s,input){s.server.rules=normalize(input);s.server.rulesKey=JSON.stringify(s.server.rules);return s.server.rules;}
function recordDraw(s,side,card,reason,events,defs){
 const event={type:'card:drawn',side,instanceId:card.instanceId,reason};
 events.push(event);
 if(reason==='initial'||!defs)return;
 // Finish this successful draw's triggers before attempting the next draw.
 const E=require('./effect-events.cjs');
 E.resolveCollected(s,E.collect(s,event.type,event,defs),defs,events);
}
function draw(s,side,count,reason,events,defs){
 const {drawCard}=require('./card-zones.cjs'),rules=get(s);
 if(!['p','c'].includes(side)||!Number.isSafeInteger(count)||count<0)throw Error('INVALID_DRAW');
 // C1 does not choose a discard/burn/skip rule at a finite hand limit. Fail before mutation.
 if(rules.handLimit!==null&&s.private[side].hand.length+count>rules.handLimit)throw Error('HAND_LIMIT_POLICY_REQUIRES_DECISION');
 for(let i=0;i<count&&!s.server.gameOver;i++){
  const card=drawCard(s,side);
  if(!card){require('./resolution-boundary.cjs').settleBoundary(s,events,[{side,reason:reason==='normal'?'DECK_EXHAUSTED':'DRAW_FAILED'}]);return false;}
  recordDraw(s,side,card,reason,events,defs);
 }return true;
}
function initialize(s,input,events=[]){
 attach(s,input);const rules=get(s);s.activeSide='p';s.turn=1;s.server.turnsStarted={p:1,c:0};
 for(const side of ['p','c']){if(s.private[side].hand.length)throw Error('INITIAL_HAND_ALREADY_PRESENT');const mana=1+(side==='c'?rules.secondPlayerInitialManaBonus:0);s.players[side].maxMana=mana;s.players[side].mana=mana;}
 for(let i=0;i<rules.initialHandSize&&!s.server.gameOver;i++)for(const side of ['p','c'])draw(s,side,1,'initial',events);
 if(rules.firstPlayerFirstDraw&&!s.server.gameOver)draw(s,'p',rules.normalDrawCount,'normal-first',events);return events;
}
module.exports={DEFAULTS,normalize,get,attach,draw,initialize,recordDraw};

},
"./royal-wind.cjs":function(module,exports,require){
'use strict';
const {destinations,relocate}=require('./wind-spells.cjs');
const {enabled}=require('./effective-rules.js');
const id='royal_wind',card='風精霊の加護';

function reason(state,side){
 if(!['p','c'].includes(side)||state.server.gameOver||state.activeSide!==side)return '手番中のみ使用できます。';
 if(!state.enchantments.some(e=>e.cardId===card&&e.zone!=='graveyard'&&e.remainingTurns>0&&e.target?.kind==='king'&&e.target.side===side&&enabled(state,{sourceInstanceId:'king:'+side},id,'activated',e.instanceId)))return '有効な付与がありません。';
 if(state.server.kingAction?.[side]?.[id])return 'このターンは使用済みです。';
 return '';
}

function destination(state,side,target){
 if(target?.kind!=='creature'||typeof target.instanceId!=='string')return null;
 const from=state.board.findIndex(p=>p?.sourceInstanceId===target.instanceId);
 if(from<0||Math.floor(from/5)!==(side==='p'?4:0))return null;
 const [to]=destinations(state,from,side,'突風');
 return to===undefined?null:{from,to};
}

function valid(state,action){
 return !reason(state,action.side)&&!!destination(state,action.side,action.target);
}

function apply(state,action,defs){
 if(!valid(state,action))return {ok:false,code:'ILLEGAL_ABILITY'};
 const {side}=action,{from,to}=destination(state,side,action.target);
 state.server.kingAction||={};
 (state.server.kingAction[side]||={})[id]=1;
 const events=[{type:'king:ability-used',side,abilityId:id,cell:from}];
 relocate(state,from,to,defs,events,false);
 return {ok:true,events};
}
module.exports={reason,valid,apply};

},
"./a3-actions.cjs":function(module,exports,require){
'use strict';
const R=require('./a3-rules.js'),{ensureInstances}=require('./card-zones.cjs'),{forgetCard}=require('./hand-visibility.cjs');
const {weakenEffect,clearWeakened,poisonEffect,clearPoison}=require('./creature-status.cjs');
const {castEnchantment}=require('./enchantment-cast.cjs'),{removeEnchantment}=require('./enchantment-lifecycle.cjs');
function temporary(s){return [...(s.temporaryEffects||[]),...s.board.flatMap(p=>p?[...(p.actionRestrictions||[]).map(e=>({...e,target:{kind:'creature',instanceId:p.sourceInstanceId},source:e,piece:p})),...weakenEffect(p),...poisonEffect(p)]:[])].map(e=>({...e,temporary:true,source:e.source||e}));}
function candidates(s,target,viewer){return R.candidates(s.enchantments,temporary(s),target,viewer);}
function apply(s,a,defs){
 if(s.server.gameOver)return {ok:false,code:'GAME_OVER'};
 if(a.side!==s.activeSide)return {ok:false,code:'NOT_YOUR_TURN'};
 const dispel=a.type==='play_spell'&&a.cardId==='解呪',def=defs[a.cardId];
 if(!def||!Number.isSafeInteger(def.cost)||def.cost<0||(!dispel&&!R.durations[a.cardId]))return {ok:false,code:'INVALID_CARD'};
 if(dispel&&s.enchantments.some(e=>e.cardId==='封魔'&&e.target?.side===a.side&&e.zone==='attached'))return {ok:false,code:'SPELLS_BLOCKED'};
 if(!require('./target-queries.cjs').cardValid(s,a,defs))return {ok:false,code:'INVALID_TARGET'};
 if(s.players[a.side].mana<def.cost)return {ok:false,code:'INSUFFICIENT_MANA'};
 ensureInstances(s);const matches=s.private[a.side].hand.filter(c=>c.cardId===a.cardId),card=a.instanceId?matches.find(c=>c.instanceId===a.instanceId):matches.length===1?matches[0]:null;
 if(!card)return {ok:false,code:matches.length>1?'AMBIGUOUS_CARD':'CARD_NOT_IN_HAND'};
 let selected=null,c;
 if(dispel){c=candidates(s,a.target,a.side);selected=c.public.find(e=>String(e.instanceId??e.id)===String(a.effectId));if(c.public.length&&!selected)return {ok:false,code:'PUBLIC_CHOICE_REQUIRED'};if(!c.public.length&&a.effectId!=null)return {ok:false,code:'INVALID_EFFECT'};}
 const events=[{type:'card:played',side:a.side,cardId:a.cardId,instanceId:card.instanceId}];
 s.private[a.side].hand.splice(s.private[a.side].hand.indexOf(card),1);forgetCard(s,card.instanceId);s.players[a.side].mana-=def.cost;
 if(!dispel){castEnchantment(s,{cardId:a.cardId,owner:a.side,controller:a.side,target:a.target,instanceId:card.instanceId},events);return {ok:true,events};}
 s.players[a.side].graveyard.push(card);
 const choice=R.choose(c,selected,()=>R.random(s.server));const effect=choice.effect;
 if(effect?.temporary){
  if(effect.kind==='weakened'&&effect.piece)clearWeakened(effect.piece);
  else if(effect.kind==='poisoned'&&effect.piece)clearPoison(effect.piece);
  else if(effect.piece)effect.piece.actionRestrictions=effect.piece.actionRestrictions.filter(e=>e!==effect.source);
  else s.temporaryEffects=(s.temporaryEffects||[]).filter(e=>e!==effect.source);
  events.push({type:'temporary:ended',id:effect.id,reason:'dispelled'});
 }else if(effect)removeEnchantment(s,effect,events,'dispelled');
 events.push({type:'dispel:resolved',side:a.side,removed:!!effect,...(effect?.kind==='weakened'&&effect.piece?{weakened:true}:{})});return {ok:true,events};
}
module.exports={apply,candidates,temporary};

},
"./creature-status.cjs":function(module,exports,require){
'use strict';

function paralyze(state,instanceId,events){
 if(typeof instanceId!=='string')return false;
 const piece=state.board.find(p=>p?.sourceInstanceId===instanceId);
 if(!piece)return false;
 if(!piece.paralyzed)events?.push({type:'creature:weakened',creature:piece.type});
 piece.paralyzed=true;
 return true;
}

function refreshRights(piece){
 if(piece.paralyzed)clearWeakened(piece);
 else{
  piece.m=false;
  piece.a=false;
  piece.attacksUsed=0;
 }
 if(piece.abilityUses)piece.abilityUses={};
}

function weakenEffect(piece){
 if(!piece.paralyzed)return [];
 return [{id:'weaken:'+piece.sourceInstanceId,kind:'weakened',public:true,target:{kind:'creature',instanceId:piece.sourceInstanceId},piece}];
}

function clearWeakened(piece){delete piece.paralyzed;}

function poison(state,id,turns){
 if(!Number.isSafeInteger(turns)||turns<1)throw Error('INVALID_POISON_DURATION');
 if(typeof id!=='string')return false;
 const piece=state.board.find(p=>p?.sourceInstanceId===id);
 if(!piece)return false;
 const total=(piece.poisonTurns||0)+turns;
 if(!Number.isSafeInteger(total))throw Error('INVALID_POISON_DURATION');
 piece.poisonTurns=total;
 return true;
}
function poisonEffect(piece){
 if(!(piece.poisonTurns>0))return [];
 return [{id:'poison:'+piece.sourceInstanceId,kind:'poisoned',remainingTurns:piece.poisonTurns,public:true,target:{kind:'creature',instanceId:piece.sourceInstanceId},piece}];
}
function clearPoison(piece){delete piece.poisonTurns;}
function tickPoison(state,id,defs,events){
 const cell=state.board.findIndex(p=>p?.sourceInstanceId===id);
 if(cell<0||!(state.board[cell].poisonTurns>0))return;
 const hit=require('./damage-engine.cjs').damageCreature(state,cell,1,defs);
 const piece=state.board[cell];
 if(piece?.sourceInstanceId===id&&--piece.poisonTurns===0)clearPoison(piece);
 events.push(...hit.events);
 require('./effect-events.cjs').dispatchGroup(state,hit.events,defs,events);
 require('./resolution-boundary.cjs').settleBoundary(state,events,[],{unitBoundary:true});
}

module.exports={paralyze,refreshRights,weakenEffect,clearWeakened,poison,poisonEffect,clearPoison,tickPoison};

},
"./enchantment-cast.cjs":function(module,exports,require){
'use strict';
/** Server-side enchantment cast lifecycle, staged state supplied by caller. */
const {removeEnchantment}=require('./enchantment-lifecycle.cjs');
const A3=require('./a3-rules.js');
const DURATIONS=Object.freeze(A3.durations);
function castEnchantment(state,{cardId,owner,controller=owner,target,instanceId,createdTurn=state.turn},events=[]){
 if(!DURATIONS[cardId])throw new TypeError('Unsupported enchantment');
 if(!state.players?.[owner]?.graveyard)throw new TypeError('Invalid owner');
 if(!instanceId||state.enchantments.some(e=>e.instanceId===instanceId))throw new TypeError('Invalid instance ID');
 if(!target||!['creature','cell','king','global'].includes(target.kind))throw new TypeError('Invalid target');
 let piece=null;
 if(target.kind==='creature'){
  piece=state.board.find(p=>p&&p.sourceInstanceId===target.instanceId);
  if(!piece)throw new TypeError('Target creature not found');
 }
 if(!A3.castValid(state.board,cardId,controller,target))throw new TypeError('Invalid enchantment target');
 const enchantment={instanceId,cardId,owner,controller,caster:controller,zone:target.kind==='global'?'global':'attached',target:{...target},remainingTurns:DURATIONS[cardId],createdTurn};
 if(cardId==='マイン')enchantment.hidden=true;
 state.enchantments.push(enchantment);
 if(cardId==='バーサーク')piece.berserk=A3.berserk(state.enchantments,target);
 events.push({type:'enchantment:cast',cardId,instanceId});
 return enchantment;
}
module.exports={castEnchantment,DURATIONS};

},
"./enchantment-lifecycle.cjs":function(module,exports,require){
'use strict';
/** Enchantment lifecycle hooks. Rules are registered by effect ID, not embedded in turn code. */
const A3=require('./a3-rules.js');
const EFFECTS={
 'バーサーク':{
  onTick({state,enchantment}){const p=state.board.find(p=>p&&p.sourceInstanceId===enchantment.target?.instanceId);if(p)p.berserk=A3.berserk(state.enchantments,enchantment.target);},
  onRemove({state,enchantment}){const p=state.board.find(p=>p&&p.sourceInstanceId===enchantment.target?.instanceId);if(p)p.berserk=A3.berserk(state.enchantments,enchantment.target);}
 },
 '恩寵の光':{}, 'マイン':{}, '決戦':{}, '防御結界':{}, '王の覚醒':{},
 '封魔':{expireAtTargetTurnEnd:true}
};
function removeEnchantment(state,enchantment,events,reason='expired'){
 const index=state.enchantments.indexOf(enchantment);
 if(index<0)return false;
 const grave=state.players[enchantment.owner]?.graveyard;
 if(!grave)throw new TypeError('Invalid enchantment owner');
 state.enchantments.splice(index,1);
 grave.push({instanceId:enchantment.instanceId,cardId:enchantment.cardId});
 EFFECTS[enchantment.cardId]?.onRemove?.({state,enchantment,events,reason});
 events.push({type:'enchantment:expired',instanceId:enchantment.instanceId,cardId:enchantment.cardId,reason});
 return true;
}
function onTurnEnd(state,side,events){
 for(const e of [...state.enchantments])if(EFFECTS[e.cardId]?.expireAtTargetTurnEnd&&e.target?.side===side){removeEnchantment(state,e,events,'target-turn-ended');}
}
function onTurnStart(state,side,events){
 for(const e of [...state.enchantments]){
  if(e.caster!==side||e.createdTurn===state.turn||EFFECTS[e.cardId]?.expireAtTargetTurnEnd)continue;
  if(!Number.isInteger(e.remainingTurns)||e.remainingTurns<1)throw new TypeError('Invalid remainingTurns');
  e.remainingTurns--;
  if(e.remainingTurns===0){removeEnchantment(state,e,events);continue;}
  EFFECTS[e.cardId]?.onTick?.({state,enchantment:e,events});
  events.push({type:'enchantment:ticked',instanceId:e.instanceId,remainingTurns:e.remainingTurns});
 }
}
function revalidate(state,events=[]){for(const e of [...state.enchantments])if(A3.durations[e.cardId]&&!A3.stillValid(state.board,e))removeEnchantment(state,e,events,'invalid-target');}
module.exports={revalidate,EFFECTS,removeEnchantment,onTurnEnd,onTurnStart};

},
"./action-bridge.cjs":function(module,exports,require){
 'use strict';
/** Experimental server-side reducer for basic summons only. No DOM, no globals.
 * Other actions explicitly unsupported until existing GameCore semantics are ported. */
const {validateRequest,makeResult}=require('./core-contract.cjs');
const {assertState}=require('./game-state.cjs');
const {ensureInstances,summonFromHand}=require('./card-zones.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const {resolveSummonTriggers,resolveBarricadeChoice}=require('./summon-triggers.cjs');
const combat=require('./combat-engine.cjs');
const {dispatch}=require('./effect-events.cjs');
const {advanceTurn}=require('./turn-lifecycle.cjs');
function reject(code){return {ok:false,code};}
function applyAction(state,envelope,authenticatedSide,definitions){
 try{assertState(state);}catch{return reject('INVALID_STATE');}
 const request=validateRequest(envelope,authenticatedSide,state.revision);
 if(!request.ok)return reject(request.code);
 const action=request.envelope.action;
 if(action.side!==state.activeSide&&!(state.server.pendingChoice&&action.type==='choosePromotion'&&action.side===state.server.pendingChoice.side))return reject('NOT_YOUR_TURN');
 if(state.server.gameOver)return reject('GAME_OVER');
 if(state.server.processingDepth||state.server.pendingTriggerCount||state.server.resolving)return reject('RESOLUTION_PENDING');
 if(state.server.pendingChoice?.type==='effectMove'){
  if(action.type!=='chooseEffectCell')return reject('EFFECT_CHOICE_PENDING');
  const next=clone(state),events=[],result=require('./wind-spells.cjs').choose(next,action,definitions,events);
  if(!result.ok)return reject(result.code);next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events,state:next,gameOver:!!next.server.gameOver})};
 }
 if(state.server.pendingChoice){
  if(action.type!=='choosePromotion')return reject('PROMOTION_CHOICE_PENDING');
  const choice=state.server.pendingChoice;
  if(action.side!==choice.side)return reject('NOT_YOUR_CHOICE');
  const next=clone(state),pending=next.server.pendingChoice,piece=next.board[pending.cell];
  if(!piece||piece.sourceInstanceId!==pending.instanceId||piece.type!==pending.from)return reject('INVALID_PROMOTION_TARGET');
  const events=[];
  if(action.accept){
   const fromDef=definitions[pending.from],toDef=definitions[pending.to];
   if(!fromDef||!toDef||!Number.isInteger(fromDef.hp)||!Number.isInteger(toDef.hp))return reject('INVALID_DEFINITION');
   require('./a1-state.cjs').promote(next,pending.cell,pending.to,definitions,events);
  }
  delete next.server.pendingChoice;require('./a5-entry.cjs').resume(next,definitions,events);next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events,state:next,gameOver:false})};
 }
 if(state.server.pendingSummon){
  if(action.type!=='chooseTokenCell')return reject('TOKEN_CHOICE_PENDING');
  const next=clone(state);
  const result=resolveBarricadeChoice(next,action.side,action.to,definitions);
  if(!result.ok)return reject(result.code);
  next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:false})};
 }
 // Only the dedicated choice branches above may resume suspended resolution.
 if(Object.keys(state.server.pendingCardTransfers||{}).length)return reject('CARD_TRANSFER_PENDING');
 if(state.server.pendingEntry||state.server.effectQueue?.length)return reject('RESOLUTION_PENDING');
 if(['move','attack_creature','attack_king'].includes(action.type)){
  const piece=state.board[action.from];
  if(!piece||piece.side!==action.side)return reject('NOT_YOUR_CREATURE');
  const next=clone(state);
  const result=action.type==='move'?combat.move(next,action.from,action.to,definitions):action.type==='attack_creature'?combat.attackCreature(next,action.from,action.to,definitions):combat.attackKing(next,action.from,definitions);
  if(!result.ok)return reject(result.code);
  next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:!!next.server.gameOver}),...(result.resolution?{combat:result.resolution}:{})};
 }
 if(action.type==='end_turn'){
  const next=clone(state);
  const result=advanceTurn(next,action.side,definitions);
  if(!result.ok)return reject(result.code);
  next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:!!next.server.gameOver})};
 }
 if(action.type==='play_enchant'||action.type==='play_spell'&&action.cardId==='解呪'){
  const next=clone(state),result=require('./a3-actions.cjs').apply(next,action,definitions);
  if(!result.ok)return reject(result.code);next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:!!next.server.gameOver})};
 }
 if(action.type==='activate_ability'){
  const next=clone(state),result=require('./a5r1-actions.cjs').apply(next,action,definitions);
  if(!result.ok)return reject(result.code);next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:!!next.server.gameOver})};
 }
 if(action.type==='play_spell'){
  const next=clone(state),result=require('./a5-spells.cjs').cast(next,action,definitions);
  if(!result.ok)return reject(result.code);next.revision++;assertState(next);
  return {ok:true,...makeResult({revision:next.revision,events:result.events,state:next,gameOver:!!next.server.gameOver})};
 }
 if(action.type!=='summon')return reject('ACTION_NOT_IMPLEMENTED');
 const definition=definitions?.[action.cardId];
 if(!definition||definition.type!=='creature'||definition.token||definition.deckType==='transform')return reject('INVALID_CREATURE');
 if(!Number.isSafeInteger(definition.cost)||definition.cost<0||!Number.isSafeInteger(definition.atk)||!Number.isSafeInteger(definition.hp))return reject('INVALID_DEFINITION');
 // Existing UI: p summons in bottom row, c in top row.
 if(action.side==='p' ? action.to<20 : action.to>4)return reject('INVALID_SUMMON_ROW');
 if(state.board[action.to]!==null)return reject('CELL_OCCUPIED');
 if(!require('./target-queries.cjs').summonValid(state,action,definition))return reject('INVALID_TARGET');
 if(state.players[action.side].mana<definition.cost)return reject('INSUFFICIENT_MANA');
 const next=clone(state);ensureInstances(next);
 const matching=next.private[action.side].hand.filter(c=>c.cardId===action.cardId);
 const selected=action.instanceId?matching.find(c=>c.instanceId===action.instanceId):matching.length===1?matching[0]:null;
 if(!selected)return reject(matching.length>1&&!action.instanceId?'AMBIGUOUS_CARD':'CARD_NOT_IN_HAND');
 // Atomic copy: all mutations occur on a clone, only successful result is returned.
 const piece={type:action.cardId,atk:definition.atk,hp:definition.hp,owner:action.side,side:action.side,m:false,a:false,attacksUsed:0,sourceInstanceId:selected.instanceId};
 summonFromHand(next,action.side,selected.instanceId,action.to,piece);
 next.players[action.side].mana-=definition.cost;
 next.revision++;
 assertState(next);
 const events=[{type:'card:played',side:action.side,cardId:action.cardId,instanceId:selected.instanceId},{type:'creature:summoned',side:action.side,cell:action.to,cardId:action.cardId}];
 events.push(...resolveSummonTriggers(next,action.to,definitions).events);
 return {ok:true,...makeResult({revision:next.revision,events,state:next,gameOver:false})};
}
module.exports={applyAction};

},
"./turn-lifecycle.cjs":function(module,exports,require){
'use strict';
/** Server-only turn transition. Ordering follows the legacy HTML: end effects,
 * switch side, refresh resources/actions, expire enchantments, start triggers, draw.
 * UI animation and CPU scheduling are deliberately excluded.
 */
const {dispatch}=require('./effect-events.cjs');
const {drawCard}=require('./card-zones.cjs');
const other=side=>side==='p'?'c':'p';
const {onTurnStart,onTurnEnd}=require('./enchantment-lifecycle.cjs');
function expireEnchantments(state,side,events){return onTurnStart(state,side,events);}
function advanceTurn(state,side,definitions){
 if(side!==state.activeSide)return {ok:false,code:'NOT_YOUR_TURN'};
 if(state.server.pendingChoice||state.server.pendingSummon)return {ok:false,code:'CHOICE_PENDING'};
 if(state.server.gameOver)return {ok:false,code:'GAME_OVER'};
 const events=[{type:'turn:ended',side}];
 dispatch(state,'turn:ended',{side},definitions,events);
 if(state.server.gameOver)return {ok:true,events};
 require('./a1-rules.js').expireRestrictions(state.board,side);
 onTurnEnd(state,side,events);
 const next=other(side);state.activeSide=next;if(next==='p')state.turn++;
 state.server.kingAction||={p:{},c:{}};state.server.kingAction[next]={};
 const p=state.players[next];
 const bonus=state.server.manaBonus?.[next]??0;
 const rules=require('./match-rules.cjs').get(state);p.maxMana=Math.max(0,Math.min(10,state.turn+(next==='c'?rules.secondPlayerInitialManaBonus:0)+bonus));
 p.mana=p.maxMana;
 for(const piece of state.board)if(piece?.side===next)require('./creature-status.cjs').refreshRights(piece);
 expireEnchantments(state,next,events);
 events.push({type:'turn:started',side:next});
 dispatch(state,'turn:started',{side:next},definitions,events);
 if(state.server.gameOver)return {ok:true,events};
 require('./match-rules.cjs').draw(state,next,rules.normalDrawCount,rules.normalDrawCount===1?'normal':'normal-modified',events,definitions);
 return {ok:true,events};
}
module.exports={advanceTurn,expireEnchantments};

},
"./a5r1-actions.cjs":function(module,exports,require){
'use strict';
const K=require('./a5r1-abilities.js'),C=require('./combat-engine.cjs'),{makePort}=require('./a1-port.cjs');
function apply(state,action,defs){
 const paid=require('./paid-creature-abilities.cjs');
 if(Object.hasOwn(paid.rules,action.abilityId))return paid.apply(state,action,defs);
 if(action.abilityId==='heal')return require('./healing.cjs').apply(state,action,defs);
 if(action.abilityId==='royal_wind')return require('./royal-wind.cjs').apply(state,action,defs);
 const events=[],damage=makePort(state,defs,events);
 const target=action.target?.kind==='king'?{kind:'king',side:action.target.side}:action.target?.kind==='creature'?{kind:'creature',cell:state.board.findIndex(p=>p&&p.sourceInstanceId===action.target.instanceId)}:null;
 const from=state.board.findIndex(p=>p&&p.sourceInstanceId===action.sourceInstanceId);
 const port={gameOver:()=>!!state.server.gameOver,activeSide:()=>state.activeSide,piece:k=>state.board[k],abilities:p=>require('./effective-rules.js').abilities(p,defs,state),remaining:p=>C.attackLimit(p,defs,state)-(p.attacksUsed??(p.a?C.attackLimit(p,defs,state):0)),mana:s=>state.players[s].mana,pay:(s,n)=>state.players[s].mana-=n,spend:p=>{p.attacksUsed=(p.attacksUsed??(p.a?C.attackLimit(p,defs,state):0))+1;p.a=p.attacksUsed>=C.attackLimit(p,defs,state);},validTarget:t=>t?.kind==='king'?['p','c'].includes(t.side):t?.kind==='creature'&&!!state.board[t.cell],damage:(t,n)=>t.kind==='king'?damage.damageKing(t.side,n):damage.damageCreature(t.cell,n),emit:(type,detail)=>events.push({type,...detail}),awakened:s=>state.enchantments.some(e=>e.cardId==='王の覚醒'&&e.zone!=='graveyard'&&e.target?.kind==='king'&&e.target.side===s&&require('./effective-rules.js').enabled(state,{sourceInstanceId:'king:'+s},'awaken_attack','activated',e.instanceId)),kingUsed:s=>state.server.kingAction?.[s]?.awaken_attack||0,spendKing:s=>{state.server.kingAction||={p:{},c:{}};state.server.kingAction[s]||={};state.server.kingAction[s].awaken_attack=(state.server.kingAction[s].awaken_attack||0)+1;}};
 const source=state.board[from],limit=defs[source?.type]?.abilityLimits?.[action.abilityId];if(source&&limit!=null&&(source.abilityUses?.[action.abilityId]||0)>=limit)return {ok:false,code:'ILLEGAL_ABILITY'};
 const ok=action.abilityId==='sorcerer_bolt'?K.bolt(port,action.side,from,target):action.abilityId==='awaken_attack'?K.awaken(port,action.side,target):false;
 if(ok&&source)(source.abilityUses||={})[action.abilityId]=(source.abilityUses?.[action.abilityId]||0)+1;
 return ok?{ok:true,events}:{ok:false,code:'ILLEGAL_ABILITY'};
}
module.exports={apply};

},
"./a5-spells.cjs":function(module,exports,require){
'use strict';
const {ensureInstances,playCard,drawCard}=require('./card-zones.cjs');
const {makePort}=require('./a1-port.cjs');
const cell=k=>Number.isInteger(k)&&k>=0&&k<25;
function cast(state,action,defs){
 const {side,cardId,target}=action,d=defs[cardId];
 if(!d?.effectUnit&&!d?.targetKind&&!['ファイヤーボルト','転移魔法','ホープ','裏切り','突風','竜巻','スワップスペル','強制的呪術'].includes(cardId))return require('./a2-spells.cjs').cast(state,action,defs);
 if(!d||d.type!=='spell')return {ok:false,code:'INVALID_SPELL'};
 if(state.server.gameOver)return {ok:false,code:'GAME_OVER'};
 if(side!==state.activeSide)return {ok:false,code:'NOT_YOUR_TURN'};
 if(state.enchantments.some(e=>e.cardId==='封魔'&&e.zone!=='graveyard'&&e.target?.kind==='king'&&e.target.side===side))return {ok:false,code:'SPELLS_BLOCKED'};
 const king=target?.kind==='king'&&['p','c'].includes(target.side);
 const player=target?.kind==='player'&&['p','c'].includes(target.side);
 const index=target?.kind==='creature'&&target.instanceId?state.board.findIndex(p=>p?.sourceInstanceId===target.instanceId):-1;
 const creature=index>=0;
 if(!require('./target-queries.cjs').cardValid(state,action,defs))return {ok:false,code:'INVALID_TARGET'};
 if(state.players[side].mana<d.cost)return {ok:false,code:'INSUFFICIENT_MANA'};
 ensureInstances(state);const matches=state.private[side].hand.filter(c=>c.cardId===cardId),card=action.instanceId?matches.find(c=>c.instanceId===action.instanceId):matches.length===1?matches[0]:null;
 if(!card)return {ok:false,code:'CARD_NOT_IN_HAND'};
 playCard(state,side,card.instanceId);state.players[side].mana-=d.cost;
 const events=[{type:'card:played',side,cardId,instanceId:card.instanceId}];
 if(cardId==='クロスフレイム'||cardId==='ポイズンミスト'){
  const cells=[target.k,...require('./board-neighbors.cjs').orthogonalCells(target.k)];
  if(cardId==='ポイズンミスト'){
   for(const k of cells)require('./creature-status.cjs').poison(state,state.board[k]?.sourceInstanceId,d.poisonTurns);
   return {ok:true,events};
  }
  const damage=require('./damage-engine.cjs').damageCreatureGroup(state,cells,2,defs);
  events.push(...damage);
  require('./effect-events.cjs').dispatchGroup(state,damage,defs,events);
  return {ok:true,events};
 }
 if(cardId==='エネルヴェイト'){
  require('./creature-status.cjs').paralyze(state,target.instanceId,events);
  return {ok:true,events};
 }
 if(cardId==='強制的呪術'){require('./swap-spell.cjs').destroyPair(state,action,defs,events);return {ok:true,events};}
 if(cardId==='スワップスペル'){require('./swap-spell.cjs').resolve(state,action,defs,events);return {ok:true,events};}
 if(['突風','竜巻'].includes(cardId)){require('./wind-spells.cjs').resolve(state,action,defs,events);return {ok:true,events};}
 if(d.effectUnit||cardId==='ファイヤーボルト'||cardId==='ホープ'||cardId==='裏切り'){const descriptor=d.effectUnit||{unitId:cardId,mode:'sequential',targetPolicy:'valid-only',operations:cardId==='ホープ'?[{kind:'draw',count:2,reason:'hope'}]:cardId==='裏切り'?[{kind:'betrayal'}]:[{kind:'damage',amount:2}]};const unit=require('./resolution-boundary.cjs').resolveEffectUnit(state,descriptor,{side,targets:action.targets||(target?[target]:[])},defs);events.push(...unit.events);return {ok:true,events};}
 if(cardId==='転移魔法'){
  require('./wind-spells.cjs').relocate(state,index,action.to,defs,events);
 }
 return {ok:true,events};
}
module.exports={cast};

},
"./legacy-adapter.cjs":function(module,exports,require){
'use strict';
/** HTML deck top=last; Core deck top=first. Reference targets become stable IDs. */
const {createState}=require('./game-state.cjs');
const identities=require('./legacy-card-identities.js');
const copy=x=>structuredClone(x);
function fromLegacyState(S){
 if(!S||!Array.isArray(S.board)||S.board.length!==25)throw new TypeError('Invalid legacy board');
 S=copy(S);
 if(Object.keys(S.pendingCardTransfers||{}).length)throw Error('CARD_TRANSFER_PENDING');
 identities.ensure(S);identities.validate(S);
 const board=copy(S.board),players={},privateData={},metadata=S.coreBridge;
 function cards(list,side,zone){
  if(!Array.isArray(list))throw new TypeError('Missing legacy cards');
  const saved=zone==='graveyard'?null:S.cardIdentities[side][zone];
  if(saved&&(saved.length!==list.length||saved.some((c,i)=>(typeof c==='string'?c:c.cardId)!==(typeof list[i]==='string'?list[i]:list[i].cardId))))throw new Error('STALE_BRIDGE_CARD_IDENTITIES');
  return list.map((c,i)=>saved?copy(saved[i]):typeof c==='string'?(zone==='hand'?{instanceId:side+'-initial-'+i,cardId:c}:c):({cardId:c.cardId,instanceId:String(c.instanceId)}));
 }
 for(const side of ['p','c']){
  players[side]={kingHp:S[side+'Hp'],mana:S.manaBySide?.[side],maxMana:S.maxManaBySide?.[side],graveyard:cards(S.graveyards?.[side]||[],side,'graveyard')};
  privateData[side]={hand:cards(S[side==='p'?'hand':'cHand'],side,'hand'),deck:cards(S[side==='p'?'deck':'cDeck'],side,'deck').reverse()};
 }
 function target(t){if(t?.kind!=='creature')return copy(t);const index=t.ref?S.board.indexOf(t.ref):S.board.findIndex(p=>p&&String(p.sourceInstanceId)===String(t.instanceId));if(index<0)throw new Error('UNRESOLVED_CREATURE_REFERENCE');board[index].sourceInstanceId??='adapter-board-'+index;return {kind:'creature',instanceId:String(board[index].sourceInstanceId)};}
 const enchantments=(S.enchantments||[]).map(e=>({...copy(e),instanceId:String(e.instanceId),target:target(e.target)}));
 const serverData={...copy(metadata?.server||{}),legacyAdapter:true,gameOver:!!S.gameOver};if(S.rules!==undefined)serverData.rules=require('./match-rules.cjs').normalize(S.rules);if(serverData.rules!==undefined)serverData.rules=require('./match-rules.cjs').normalize(serverData.rules);
 // Top-level HTML resolution fields are authoritative; cleared work must not revive.
 for(const key of ['pendingChoice','pendingSummon','pendingEntry','effectQueue'])delete serverData[key];
 for(const viewer of ['p','c'])if(serverData.revealedTo?.[viewer]){const hand=new Set(privateData[viewer==='p'?'c':'p'].hand.map(c=>c.instanceId));serverData.revealedTo[viewer]=serverData.revealedTo[viewer].filter(id=>hand.has(id));}
 for(const key of ['winner','draw','rngState','manaBonus','kingAction','eventHistory','pendingChoice','pendingSummon','pendingEntry','effectQueue','nextCreatureId','nextCardIdentity'])if(S[key]!==undefined)serverData[key]=copy(S[key]);
 const temporaryEffects=S.temporaryEffects?.map(e=>({...copy(e),...(e.target?{target:target(e.target)}:{})}));
 if(S.tokenPlacement){
  const t=S.tokenPlacement;if(!t.side||!Number.isInteger(t.cell)||!t.sourceInstanceId)throw new Error('UNSUPPORTED_LEGACY_PENDING_CHOICE');
  serverData.pendingSummon={side:t.side,cell:t.cell,sourceInstanceId:t.sourceInstanceId,choices:copy(t.choices)};
 }
 if(S.pendingEntryHtml){const q=S.pendingEntryHtml;serverData.pendingEntry={cell:q.k,instanceId:q.p.sourceInstanceId,jobs:copy(q.jobs).map(j=>({...j,...(j.instanceId!==undefined?{instanceId:String(j.instanceId)}:{})}))};}
 const result=createState({board,players,privateData,activeSide:S.side,turn:S.turn||1,revision:S.revision??metadata?.revision??0,enchantments,serverData});
 for(const key of ['abilityControls','modifiers'])if(S[key]!==undefined)result[key]=copy(S[key]);
 if(temporaryEffects)result.temporaryEffects=temporaryEffects;
 return result;
}
function toLegacyState(core){
 require('./game-state.cjs').assertState(core);core=copy(core);require('./card-zones.cjs').ensureInstances(core);
 const s={board:copy(core.board),side:core.activeSide,turn:core.turn,revision:core.revision,gameOver:!!core.server.gameOver,graveyards:{},manaBySide:{},maxManaBySide:{},enchantments:[],mines:Array(25).fill(null),battles:[],card:null,piece:null,nextCardInstanceId:1,coreBridge:{revision:core.revision,server:copy(core.server),zones:{}}};
 s.cardIdentities={p:{},c:{}};
 for(const side of ['p','c']){
  const p=core.players[side],priv=core.private[side],hand=copy(priv.hand),deck=copy(priv.deck).reverse();
  s[side+'Hp']=p.kingHp;s.manaBySide[side]=p.mana;s.maxManaBySide[side]=p.maxMana;s.graveyards[side]=copy(p.graveyard);
  s[side==='p'?'hand':'cHand']=hand.map(c=>typeof c==='string'?c:c.cardId);s[side==='p'?'deck':'cDeck']=deck.map(c=>typeof c==='string'?c:c.cardId);
  s.coreBridge.zones[side]={hand,deck,graveyard:copy(p.graveyard)};
  s.cardIdentities[side]={hand:copy(hand),deck:copy(deck)};
 }
 function target(t){if(t?.kind!=='creature')return copy(t);const ref=s.board.find(p=>p&&String(p.sourceInstanceId)===String(t.instanceId));if(!ref)throw new Error('UNRESOLVED_CREATURE_REFERENCE');return {kind:'creature',ref};}
 s.enchantments=core.enchantments.map(e=>({...copy(e),target:target(e.target)}));
 if(core.temporaryEffects)s.temporaryEffects=core.temporaryEffects.map(e=>({...copy(e),...(e.target?{target:target(e.target)}:{})}));
 for(const e of s.enchantments){if(e.target?.kind==='cell'&&e.cardId==='マイン'){const k=e.target.k;s.mines[k]||={side:e.owner,turns:e.remainingTurns,card:e,cards:[]};s.mines[k].cards.push(e);s.mines[k].turns=Math.max(s.mines[k].turns,e.remainingTurns);}if(e.cardId==='決戦')s.battles.push({turns:e.remainingTurns,card:e});}
 for(const key of ['winner','draw','rngState','manaBonus','kingAction','eventHistory','pendingChoice','pendingSummon','pendingEntry','effectQueue','nextCreatureId','nextCardIdentity'])if(core.server[key]!==undefined)s[key]=copy(core.server[key]);
 if(core.server.pendingSummon)s.tokenPlacement=copy(core.server.pendingSummon);
 if(core.server.pendingEntry){const q=core.server.pendingEntry;s.pendingEntryHtml={k:q.cell,p:s.board.find(p=>p&&String(p.sourceInstanceId)===String(q.instanceId))||{sourceInstanceId:q.instanceId},jobs:copy(q.jobs)};}
 if(core.server.rules!==undefined)s.rules=require('./match-rules.cjs').normalize(core.server.rules);for(const key of ['abilityControls','modifiers'])if(core[key]!==undefined)s[key]=copy(core[key]);
 s.nextCardInstanceId=1+Math.max(0,...[...s.enchantments,...s.graveyards.p,...s.graveyards.c].map(e=>Number(e.instanceId)).filter(Number.isSafeInteger));
 s.kingAction||={p:{},c:{}};s.manaBonus||={p:0,c:0};
 return s;
}
module.exports={fromLegacyState,toLegacyState};

},
"./legacy-card-identities.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.R3Cards=factory();})(globalThis,function(){
'use strict';
const sides=['p','c'],copy=x=>structuredClone(x),name=c=>typeof c==='string'?c:c.cardId;
function list(s,side,zone){return zone==='graveyard'?(s.graveyards?.[side]||[]):s[side==='p'?zone:zone==='hand'?'cHand':'cDeck'];}
function used(s){return new Set([
 ...sides.flatMap(side=>['hand','deck'].flatMap(z=>(list(s,side,z)||[]).filter(c=>typeof c==='object').map(c=>c.instanceId))),
 ...sides.flatMap(side=>['hand','deck'].flatMap(z=>(s.coreBridge?.zones?.[side]?.[z]||[]).map(c=>c.instanceId))),
 ...(s.board||[]).filter(Boolean).map(p=>p.sourceInstanceId),
 ...(s.enchantments||[]).map(e=>e.instanceId),
 ...sides.flatMap(side=>(s.graveyards?.[side]||[]).map(c=>c.instanceId)),
 ...sides.flatMap(side=>['hand','deck'].flatMap(z=>(s.cardIdentities?.[side]?.[z]||[]).map(c=>c.instanceId))),
 ...Object.values(s.pendingCardTransfers||{}).map(c=>c.instanceId)
 ].filter(x=>x!==undefined).map(String));}
function allocate(s){const ids=used(s);s.nextCardIdentity=Math.max(1,s.nextCardIdentity||1);let id;do{id='html-card-'+s.nextCardIdentity++;}while(ids.has(id));return id;}
function ensure(s){
 if(!s.cardIdentities){
  const saved=s.coreBridge?.zones;
  for(const side of sides)for(const zone of ['hand','deck']){const a=list(s,side,zone)||[],old=saved?.[side]?.[zone];if(old&&(old.length!==a.length||old.some((c,i)=>name(c)!==name(a[i]))))throw Error('STALE_BRIDGE_CARD_IDENTITIES');}
  s.cardIdentities={p:{hand:[],deck:[]},c:{hand:[],deck:[]}};
  for(const side of sides)for(const zone of ['hand','deck']){
   const a=list(s,side,zone)||[],old=saved?.[side]?.[zone];
   if(old&&(old.length!==a.length||old.some((c,i)=>name(c)!==name(a[i]))))throw Error('STALE_BRIDGE_CARD_IDENTITIES');
   s.cardIdentities[side][zone]=a.map((c,i)=>{const prior=old?.[i]||c;return {cardId:name(c),instanceId:typeof prior==='object'?String(prior.instanceId):allocate(s)};});
  }
 }
 for(const side of sides)for(const zone of ['hand','deck']){const a=list(s,side,zone)||[],m=s.cardIdentities[side]?.[zone];if(!m||m.length!==a.length||m.some((c,i)=>c.cardId!==name(a[i])))throw Error('STALE_BRIDGE_CARD_IDENTITIES');}
 return s.cardIdentities;
}
function drawIdentity(s,side){ensure(s);const deck=list(s,side,'deck'),hand=list(s,side,'hand');if(!deck.length)return null;const c=s.cardIdentities[side].deck.pop();deck.pop();hand.push(c.cardId);s.cardIdentities[side].hand.push(c);return copy(c);}
function take(s,side,index){ensure(s);const hand=list(s,side,'hand');if(!Number.isInteger(index)||index<0||index>=hand.length)throw Error('INVALID_CARD_INDEX');hand.splice(index,1);const card=s.cardIdentities[side].hand.splice(index,1)[0];for(const viewer of sides){const known=s.coreBridge?.server?.revealedTo?.[viewer];if(known)s.coreBridge.server.revealedTo[viewer]=known.filter(id=>id!==card.instanceId);}return card;}
function stage(s,side,index){if(s.pendingCardTransfers?.[side])throw Error('CARD_TRANSFER_PENDING');const c=take(s,side,index);(s.pendingCardTransfers||={})[side]=c;return c;}
function finish(s,side,cardId){const c=s.pendingCardTransfers?.[side];if(!c)return null;if(c.cardId!==cardId)throw Error('CARD_TRANSFER_MISMATCH');delete s.pendingCardTransfers[side];return c.instanceId;}
function validate(s){ensure(s);const all=[];for(const side of sides)for(const zone of ['hand','deck'])for(const c of s.cardIdentities[side][zone])all.push(c.instanceId);for(const side of sides)for(const c of s.graveyards?.[side]||[])all.push(c.instanceId);for(const p of s.board||[])if(p?.sourceInstanceId!==undefined)all.push(p.sourceInstanceId);for(const e of s.enchantments||[])all.push(e.instanceId);const ids=all.map(String);if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_PHYSICAL_ID');return true;}
return {ensure,allocate,draw:drawIdentity,take,stage,finish,validate};
});

},
"./r4-command-bridge.cjs":function(module,exports,require){
'use strict';
const A=require('./legacy-adapter.cjs'),G=require('./game-core.cjs'),I=require('./legacy-card-identities.js'),R=require('./a3-rules.js');
const copy=x=>structuredClone(x);
function request(core,action,defs){return G.execute(core,{matchId:core.server.matchId||'html-local',actionId:'html-'+action.type+'-'+core.revision,expectedRevision:core.revision,action},action.side,defs);}
function commit(S,core,events){
 const old=new Map(S.board.filter(Boolean).map(p=>[String(p.sourceInstanceId),p]));
 // Update removed piece references too: callers may still hold the attacked piece for presentation.
 for(const e of events)if(e.type==='creature:damaged'&&S.board[e.cell])S.board[e.cell].hp-=e.amount;
 const out=A.toLegacyState(core);
 out.board=out.board.map(p=>{if(!p)return null;const ref=old.get(String(p.sourceInstanceId));if(!ref)return p;for(const k of Object.keys(ref))delete ref[k];Object.assign(ref,p);return ref;});
 function rebind(t){if(t?.kind==='creature'&&t.ref)t.ref=out.board.find(p=>p&&String(p.sourceInstanceId)===String(t.ref.sourceInstanceId));}
 for(const e of out.enchantments)rebind(e.target);for(const e of out.temporaryEffects||[])rebind(e.target);
 if(out.pendingEntryHtml)out.pendingEntryHtml.p=out.board.find(p=>p&&String(p.sourceInstanceId)===String(out.pendingEntryHtml.p.sourceInstanceId))||out.pendingEntryHtml.p;
 for(const side of ['p','c'])out.graveyards[side]=out.graveyards[side].map(c=>({...c,owner:side,zone:'graveyard'}));
 const excluded=new Set(['card','piece','eventHistory']);
 for(const k of ['pendingChoice','pendingSummon','pendingEntry','tokenPlacement','pendingEntryHtml'])delete S[k];
 for(const [k,v] of Object.entries(out))if(!excluded.has(k))S[k]=v;
 // The selected attacker may have died from a resolved counter ability.
 if(S.piece!=null&&!S.board[S.piece])S.piece=null;
 return out;
}
function execute(S,action,defs,{autoCpuChoice=false}={}){
 const core=A.fromLegacyState(S);let r=request(core,action,defs);if(!r.ok)return r;
 let events=[...r.events];
 while(r.state.server.pendingChoice?.type==='guardian'&&r.state.server.pendingChoice.side==='c'){
  const choice=G.queryGuardianChoices(r.state,'c')[0];
  r=request(r.state,choice,defs);
  if(!r.ok)throw Error(r.code);
  events.push(...r.events);
 }
 if(autoCpuChoice&&r.state.server.pendingSummon?.side==='c'){
  const q=r.state.server.pendingSummon,to=q.choices[Math.floor(R.random(r.state.server)*q.choices.length)];
  const next=request(r.state,{type:'chooseTokenCell',side:'c',to},defs);if(!next.ok)throw Error(next.code);r=next;events.push(...r.events);
 }
 commit(S,r.state,events);return {ok:true,events,state:r.state,...(r.combat?{combat:r.combat}:{})};
}
function summon(S,side,index,to,defs){
 const hand=side==='p'?S.hand:S.cHand,cardId=hand?.[index];if(!cardId)return {ok:false,code:'CARD_NOT_IN_HAND'};
 const staged=copy(S);I.ensure(staged);const instanceId=staged.cardIdentities[side].hand[index]?.instanceId;
 const result=execute(staged,{type:'summon',side,cardId,instanceId,to},defs,{autoCpuChoice:true});if(!result.ok)return result;
 commit(S,result.state,result.events);return {...result,piece:S.board[to]};
}
function attack(S,from,to,defs){
 const target=to===null?null:S.board[to];
 const result=execute(S,{type:to===null?'attack_king':'attack_creature',side:S.side,from,...(to===null?{}:{to})},defs);if(!result.ok)return result;
 return {...result,hit:{piece:target,amount:0,...result.combat,pending:!result.combat}};
}
function chooseToken(S,side,to,defs){return execute(S,{type:'chooseTokenCell',side,to},defs);}
module.exports={execute,summon,attack,chooseToken,commit};

},
"./deck-validation.cjs":function(module,exports,require){
'use strict';
// Shared deck data boundary. Strict validation reads raw counts before draft recovery.
function create(definitions){
 const ids=Object.keys(definitions).filter(id=>definitions[id].deckType==='normal'),SIZE=40,LIMIT=4;
 const renames=new Map([['パラライズ','エネルヴェイト']].filter(([,id])=>ids.includes(id)));
 const canonicalId=id=>renames.get(id)??id;
 const legacyName=new Map([...renames].map(([old,id])=>[id,old]));
 const aliases={'銀級兵':'銀兵','金級兵':'金兵'};
 function record(raw){try{if(raw===null||typeof raw!=='object'||Array.isArray(raw))return null;const proto=Object.getPrototypeOf(raw);if(proto!==null&&Object.getPrototypeOf(proto)!==null)return null;return Object.getOwnPropertyDescriptors(raw);}catch{return null;}}
 function count(value){if(typeof value!=='number'&&typeof value!=='string')return null;if(typeof value==='string'&&!value.trim())return null;const n=Number(value);return Number.isFinite(n)&&Number.isInteger(n)&&n>=0&&n<=LIMIT?n:null;}
 function inspect(raw){
  const props=record(raw),counts={},errors=[];if(!props)errors.push('INVALID_STRUCTURE');
  for(const id of ids){
   const legacy=legacyName.get(id);
   const keys=legacy?[id,legacy]:[props&&Object.hasOwn(props,id)?id:aliases[id]??id];
   const values=keys.filter(key=>props&&Object.hasOwn(props,key)).map(key=>Object.hasOwn(props[key],'value')?count(props[key].value):null);
   const sum=values.reduce((a,n)=>a+n,0);
   const invalid=values.includes(null)||sum>LIMIT;
   if(invalid)errors.push('INVALID_COUNT:'+id);
   counts[id]=invalid?0:sum;
  }
  const total=Object.values(counts).reduce((a,n)=>a+n,0);return {counts,total,errors,valid:errors.length===0&&total===SIZE};
 }
 function normalize(raw){return inspect(raw).counts;}
 function defaultCounts(){return normalize(Object.fromEntries(ids.map(id=>[id,definitions[id].deckCount??0])));}
 function valid(raw){return inspect(raw).valid;}
 function toCardIds(raw){const x=inspect(raw);if(!x.valid)return null;const out=[];for(const id of ids)for(let i=0;i<x.counts[id];i++)out.push(id);return out;}
 return {SIZE,LIMIT,canonicalId,isRecord:raw=>record(raw)!==null,inspect,normalize,defaultCounts,valid,toCardIds,total:raw=>inspect(raw).total};
}
module.exports={create};

},
"./r3-command-pilot.cjs":function(module,exports,require){
'use strict';
// Small vertical slice: only moves with no entry effect. All other routes remain explicit legacy routes.
const A=require('./legacy-adapter.cjs'),G=require('./game-core.cjs'),A3=require('./a3-rules.js'),A5=require('./a5-rules.js');
function move(S,from,to,definitions,busy=false){
 const piece=S.board[from];
 if(!piece||busy||S.tokenPlacement||S.pendingEntryHtml||S.pendingChoice||S.pendingSummon||S.pendingEntry||S.effectQueue?.length||Object.keys(S.pendingCardTransfers||{}).length)return {handled:false};
 if(A5.entryJobs(piece,to,A3.mines(S.enchantments||[],to,S.side),S.side).length)return {handled:false};
 const core=A.fromLegacyState(S),revision=core.revision;
 const result=G.execute(core,{matchId:core.server.matchId||'html-local',actionId:'html-move-'+revision,expectedRevision:revision,action:{type:'move',side:S.side,from,to}},S.side,definitions);
 if(!result.ok)return {handled:true,piece:null,code:result.code};
 if(result.events.length!==1||result.events[0].type!=='creature:moved')throw Error('UNEXPECTED_PILOT_MOVE_EFFECT');
 const out=A.toLegacyState(result.state);
 // Keep live piece identity so UI/CPU locals and attached target.ref remain valid.
 Object.assign(piece,out.board[to]);S.board[from]=null;S.board[to]=piece;
 for(const key of ['revision','coreBridge','cardIdentities','nextCardIdentity'])if(out[key]!==undefined)S[key]=out[key];
 return {handled:true,piece,events:result.events};
}
module.exports={move,stateAdapter:A};

},
"./r5-command-bridge.cjs":function(module,exports,require){
'use strict';
const B=require('./r4-command-bridge.cjs'),I=require('./legacy-card-identities.js');
function target(S,staged,t,cardId){
 if(!t)return undefined;
 if(cardId==='ホープ'&&t.kind==='king')return {kind:'player',side:t.side};
 if(t.kind==='piece'||t.kind==='creature'){
  const k=t.ref?S.board.indexOf(t.ref):t.k??t.cell??S.board.findIndex(p=>p&&String(p.sourceInstanceId)===String(t.instanceId));
  return {kind:'creature',instanceId:staged.board[k]?.sourceInstanceId||'missing-target'};
 }
 return structuredClone(t);
}
function play(S,side,index,t,defs,extra={}){
 const cardId=(side==='p'?S.hand:S.cHand)?.[index],d=defs[cardId];
 if(!d||!['spell','enchant'].includes(d.type))return {ok:false,code:'INVALID_CARD'};
 const staged=structuredClone(S);I.ensure(staged);
 if(d.creaturePair){const {swapTarget,...rest}=extra;extra={...rest,sourceInstanceId:target(S,staged,swapTarget,cardId)?.instanceId};}
 const r=B.execute(staged,{type:d.type==='spell'?'play_spell':'play_enchant',side,cardId,instanceId:staged.cardIdentities[side].hand[index].instanceId,target:target(S,staged,t,cardId),...extra},defs);
 if(r.ok)B.commit(S,r.state,r.events);return r;
}
function activate(S,side,abilityId,from,t,defs){
 const staged=structuredClone(S);I.ensure(staged);
 const r=B.execute(staged,{type:'activate_ability',side,abilityId,sourceInstanceId:staged.board[from]?.sourceInstanceId,target:target(S,staged,t)},defs);
 if(r.ok)B.commit(S,r.state,r.events);return r;
}
function choosePromotion(S,accept,defs){const q=S.pendingChoice;if(!q)return {ok:false,code:'NO_CHOICE'};return B.execute(S,{type:'choosePromotion',side:q.side,accept},defs);}
module.exports={play,activate,choosePromotion};

},
"./resolution-exchange.cjs":function(module,exports,require){
'use strict';
// Integration boundary, not a disk save feature. Caller must supply the live runtime.
const A=require('./legacy-adapter.cjs');
function assertIdle(runtime){
 if(!runtime||typeof runtime.resolving!=='boolean'||!Array.isArray(runtime.queue)||!Array.isArray(runtime.summonQueue))throw Error('RUNTIME_CONTEXT_REQUIRED');
 if(runtime.resolving||runtime.queue.length||runtime.summonQueue.length)throw Error('RUNTIME_RESOLUTION_PENDING');
}
function assertSupported(server){if(server.effectQueue?.length||server.processingDepth||server.pendingTriggerCount||server.resolving)throw Error('UNSUPPORTED_EFFECT_QUEUE_RESUME');}
function exportState(S,runtime){assertIdle(runtime);const core=A.fromLegacyState(S);assertSupported(core.server);return core;}
function importState(core,runtime){assertIdle(runtime);assertSupported(core.server);return A.toLegacyState(core);}
module.exports={exportState,importState};

},
"./surrender-bridge.cjs":function(module,exports,require){
'use strict';
// Internal UI adapter. Authoritative acceptance/order/outcome remain in game-core.
const A=require('./legacy-adapter.cjs'),G=require('./game-core.cjs'),B=require('./r4-command-bridge.cjs');
function validRuntime(r){return !!r&&typeof r.resolving==='boolean'&&Array.isArray(r.queue)&&Array.isArray(r.summonQueue);}
function accept(S,side,actionId,definitions,runtime){
 if(!validRuntime(runtime))return {ok:false,code:'RUNTIME_CONTEXT_REQUIRED'};
 let core;try{core=A.fromLegacyState(S);}catch(e){return {ok:false,code:e.message};}
 // Opaque HTML work is not serializable. Mark only this acceptance call as busy,
 // then remove that adapter-owned marker; the real runtime guards boundary flush.
 const busy=runtime.resolving||runtime.queue.length>0||runtime.summonQueue.length>0,previous=core.server.resolving;
 if(busy)core.server.resolving=true;
 const result=G.execute(core,{matchId:core.server.matchId||'html-local',expectedRevision:core.revision,actionId,action:{type:'surrender',side}},side,definitions);
 if(!result.ok)return result;
 if(busy){if(previous===undefined)delete result.state.server.resolving;else result.state.server.resolving=previous;}
 B.commit(S,result.state,result.events);return result;
}
function flush(S,runtime){
 if(!validRuntime(runtime))return {ok:false,code:'RUNTIME_CONTEXT_REQUIRED'};
 if(runtime.resolving||runtime.queue.length||runtime.summonQueue.length)return {ok:false,code:'RUNTIME_RESOLUTION_PENDING'};
 let core;try{core=A.fromLegacyState(S);}catch(e){return {ok:false,code:e.message};}
 if(!core.server.pendingSurrenders?.length)return {ok:true,status:'idle',events:[]};
 const result=G.finishBoundary(core,runtime);if(result.ok&&(result.events.length||result.status==='applied'))B.commit(S,result.state,result.events);return result;
}
module.exports={accept,flush};

},
"./target-query-view.cjs":function(module,exports,require){
'use strict';
// Lightweight read-only HTML view. Missing IDs use ephemeral coordinate labels;
// this never calls identities.ensure, clones a deck, allocates IDs or advances RNG.
const id=(p,k)=>p?.sourceInstanceId??'query-cell-'+k;
function target(S,t,cardId){
 if(!t)return undefined;
 if(cardId==='ホープ'&&t.kind==='king')return {kind:'player',side:t.side};
 if(t.kind==='piece'||t.kind==='creature'){
  const k=t.ref?S.board.indexOf(t.ref):t.k??t.cell??S.board.findIndex(p=>p?.sourceInstanceId===t.instanceId);
  return {kind:'creature',instanceId:k>=0&&S.board[k]?id(S.board[k],k):'missing-target'};
 }
 return {...t};
}
function view(S,actor){
 const board=S.board.map((p,k)=>p?.sourceInstanceId?p:p?{...p,sourceInstanceId:id(p,k)}:null);
 const players={p:{mana:S.manaBySide.p},c:{mana:S.manaBySide.c}};
 const hand=(actor==='p'?S.hand:S.cHand)||[],saved=S.cardIdentities?.[actor]?.hand;
 const cards=hand.map((c,i)=>({cardId:typeof c==='string'?c:c.cardId,instanceId:saved?.[i]?.cardId===(typeof c==='string'?c:c.cardId)?saved[i].instanceId:'query-hand-'+actor+'-'+i}));
 return {abilityControls:S.abilityControls,modifiers:S.modifiers,board,players,private:{[actor]:{hand:cards}},activeSide:S.side,enchantments:(S.enchantments||[]).map(e=>({...e,target:target(S,e.target)})),temporaryEffects:(S.temporaryEffects||[]).map(e=>({...e,target:target(S,e.target)})),server:{gameOver:S.gameOver,kingAction:S.kingAction,pendingChoice:S.pendingChoice,pendingSummon:S.pendingSummon||S.tokenPlacement,pendingEntry:S.pendingEntry||S.pendingEntryHtml,effectQueue:S.effectQueue,pendingCardTransfers:S.pendingCardTransfers}};
}
function selection(S,side,index,extra={}){const value=(side==='p'?S.hand:S.cHand)?.[index],cardId=typeof value==='string'?value:value?.cardId,saved=S.cardIdentities?.[side]?.hand?.[index];return {cardId,instanceId:saved?.cardId===cardId?saved.instanceId:'query-hand-'+side+'-'+index,...extra};}
function atCell(S,a,k){return a.type==='play_spell'&&a.sourceInstanceId?S.board[k]&&a.sourceInstanceId===id(S.board[k],k):a.to===k||a.target?.kind==='cell'&&a.target.k===k||a.target?.kind==='creature'&&S.board[k]&&a.target.instanceId===id(S.board[k],k);}
function atKing(a,side){return ['king','player'].includes(a.target?.kind)&&a.target.side===side;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
module.exports={id,target,view,selection,atCell,atKing,same};

}};const cache={};function load(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,load);return m.exports;}globalThis.B2Runtime={Core:load('./game-core.cjs'),random:load('./a3-rules.js').random,deckValidationFactory:load('./deck-validation.cjs').create,definitions:{"歩兵":{"type":"creature","cost":1,"atk":3,"hp":6,"move":[[-1,0]],"deckCount":2,"description":"能力なし。"},"銀級兵":{"type":"creature","cost":2,"atk":4,"hp":6,"move":[[-1,-1],[-1,0],[-1,1],[1,-1],[1,1]],"deckCount":3,"description":"能力なし。"},"金級兵":{"type":"creature","cost":3,"atk":5,"hp":6,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,0]],"deckCount":2,"description":"能力なし。"},"チャリオット":{"type":"creature","cost":5,"atk":6,"hp":6,"move":[[-1,0],[-2,0]],"attack":[[-1,-1],[-1,0],[-1,1]],"deckCount":1,"description":"移動：前方1〜2マス（途中の駒は飛び越えない）。"},"アーチャー":{"type":"creature","cost":3,"atk":4,"hp":3,"move":[[-1,0]],"attack":[[-2,0]],"deckCount":1,"description":"間の駒を越えて攻撃できる。"},"盗賊":{"type":"creature","cost":2,"atk":2,"hp":5,"move":[[-1,0]],"attack":[[-1,-1],[-1,0],[-1,1]],"deckCount":1,"abilities":["thief_attack_mana"],"description":"通常攻撃成立後、自分の最大マナと未使用マナをそれぞれ1増やす（それぞれ上限10）。"},"サラマンダー":{"type":"creature","cost":3,"atk":4,"hp":6,"move":[[-1,-1],[-1,0],[-1,1]],"attack":[[-1,0]],"deckCount":2,"abilities":["salamander_counter"],"description":"敵クリーチャーから攻撃された時、攻撃してきたクリーチャーに3ダメージを与える。"},"踊り子":{"type":"creature","cost":3,"atk":1,"hp":2,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[],"deckCount":2,"abilities":["dancer_aura"],"description":"このクリーチャーが戦場にいる間、他の味方クリーチャーの攻撃力+1。複数体の効果は重複する。"},"戦狼":{"type":"creature","cost":4,"atk":2,"hp":6,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,0]],"deckCount":2,"abilities":["war_wolf_pack"],"description":"このクリーチャーの攻撃力は、戦場にいるほかの味方クリーチャー1体につき+1される。"},"ディアブロ":{"type":"creature","cost":6,"atk":6,"hp":9,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"deckCount":1,"abilities":["diablo_turn_start"],"description":"あなたのターン開始時に、あなたの王に2点のダメージを与える。"},"オルトロス":{"type":"creature","cost":4,"atk":2,"hp":7,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,0]],"attack":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]],"deckCount":2,"abilities":["orthros_double_attack","orthros_self_damage"],"description":"このクリーチャーは1ターンに2回攻撃できる。攻撃時、あなたの王に1点のダメージ。"},"隠密":{"jump":true,"movement":{"jump":true},"type":"creature","cost":3,"atk":3,"hp":5,"move":[[-2,-1],[-2,1]],"attack":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]],"deckCount":2,"abilities":["promote_assassin"],"description":"敵陣最奥列に到達時、暗殺者に変身できる。"},"ソーサラー":{"type":"creature","cost":4,"atk":2,"hp":2,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"deckCount":2,"abilities":["sorcerer_bolt"],"description":"攻撃権とマナ2を支払い、盤上の任意のクリーチャー/王に2点のダメージを与える。"},"守備兵":{"type":"creature","cost":4,"atk":3,"hp":6,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"deckCount":2,"abilities":["guard_barricade"],"description":"召喚時、左右の空きマスのどちらかにバリケードを1体生成する。両方埋まっている場合は生成しない。"},"バリケード":{"type":"creature","deckType":"token","cost":0,"atk":0,"hp":3,"move":[],"attack":[],"deckCount":0,"token":true,"description":"移動・攻撃できないトークン。倒されると消滅し、墓地には入らない。"},"暗殺者":{"type":"creature","deckType":"transform","cost":4,"atk":6,"hp":6,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"attack":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"deckCount":0,"description":"隠密が変身した姿。"},"ファイヤーボルト":{"type":"spell","cost":2,"damage":2,"deckCount":2,"description":"クリーチャーまたは王を選び、2ダメージ。敵味方どちらも対象にできる。"},"圧殺":{"type":"spell","cost":7,"deckCount":0,"description":"相手の王を選ぶ。使用時、あなたがクリーチャーを10体以上コントロールしていたら相手の王のHPを0にする。条件を満たさない場合もコストとカードを消費し、何も起きない。"},"裏切り":{"type":"spell","cost":10,"deckCount":0,"description":"盤上の敵味方いずれかのクリーチャー1体を選び、コントローラーを相手側に変更する。所有者・位置・HP・付属エンチャントは変わらない。使用したターン、対象クリーチャーは移動も攻撃も出来ない。"},"転移魔法":{"type":"spell","cost":5,"deckCount":0,"description":"敵味方のクリーチャー1体を選び、戦場の空きマスへ転移させる。通常の移動権は消費しない。"},"解呪":{"type":"spell","cost":2,"deckCount":1,"description":"クリーチャー・王・マス・盤面全体の公開エンチャントまたは公開一時効果を1つ解除。公開対象がなければ非公開エンチャントをランダムに1枚解除。対象なしでもカードとコストを消費。"},"ホープ":{"type":"spell","cost":1,"draw":2,"deckCount":4,"description":"自分または相手の王を選ぶ。対象のプレイヤーはカードを2枚引く。"},"マナ":{"type":"spell","cost":2,"gainMana":1,"deckCount":3,"description":"自分の最大マナと未使用マナを1増やす（最大10）。"},"バーサーク":{"type":"enchant","cost":3,"duration":3,"deckCount":2,"visual":{"auraColor":"#b985ff"},"description":"敵味方のクリーチャー1体。3ターン基本攻撃力を1.5倍（端数切り上げ）にし、移動・攻撃は前方1マスのみ。複数枚の期間は独立し、効果は重複しない。"},"マイン":{"type":"enchant","cost":2,"duration":4,"deckCount":0,"description":"空きマスに設置。4ターン以内に駒が入ると5ダメージを与えて消滅。敵味方どちらにも発動。"},"防御結界":{"type":"enchant","cost":2,"duration":3,"deckCount":2,"description":"3ターンの間、対象のマスに配置されたクリーチャーが受けるダメージを1減らす。"},"封魔":{"type":"enchant","cost":4,"duration":1,"deckCount":0,"description":"相手の王に付ける。付いている王のコントローラーはスペルを使用できない。相手の次のターン終了時まで。"},"王の覚醒":{"type":"enchant","cost":2,"duration":3,"deckCount":0,"description":"あなたの王に付ける。3ターンの間、王は自陣1段目の任意のマスに攻撃力5で攻撃できる。1ターンに1回。敵軍クリーチャーのみ対象。このカードの能力は重複しない。"},"決戦":{"type":"enchant","cost":4,"duration":2,"deckCount":1,"description":"2ターンの間、敵味方すべてのクリーチャーの攻撃力+1。後から召喚された駒も対象。重ねがけ可能。"},"突風":{"type":"spell","deckType":"normal","cost":2,"deckCount":0,"description":"クリーチャーを1体選び、あなたから見て敵陣方向へ1マス動かす。敵味方どちらも対象にできる。移動権は消費しない。移動先が盤外または占有済みの対象は選べない。"},"竜巻":{"type":"spell","deckType":"normal","cost":3,"deckCount":0,"description":"対象のクリーチャーに1点のダメージ。その後、対象クリーチャーを上下左右いずれかの方向に1マス動かす。上下左右に空きマスがない場合、位置は変わらず効果は終了する。敵味方どちらも対象にできる。移動権は消費しない。"},"ポーン":{"type":"creature","deckType":"normal","cost":1,"deckCount":0,"atk":3,"hp":5,"move":[[-1,0]],"attack":[[-1,-1],[-1,1]],"abilities":[],"description":"能力なし"},"スワップスペル":{"type":"spell","deckType":"normal","cost":5,"deckCount":0,"description":"クリーチャーを2体選び、その位置を入れ替える。敵味方どちらも対象にできる。移動権は消費しない。","creaturePair":"distinct"},"恩寵の光":{"type":"enchant","deckType":"normal","cost":4,"deckCount":0,"description":"2ターンの間、敵味方すべてのクリーチャーと王が受けるダメージを1点軽減する。この効果は重複する。"},"風精霊の加護":{"type":"enchant","deckType":"normal","cost":3,"duration":3,"deckCount":0,"description":"あなたの王につける。3ターンの間、王は「自軍1段目のクリーチャー1体を選び、あなたから見て敵陣方向へ1マス動かす」能力を得る。敵味方どちらも対象にできる。この能力は自分のターンに1度、コスト0で使える。移動権は消費しない。移動先が占有済みの対象は選べない。このカードの能力は重複しない。"},"天狗":{"type":"creature","deckType":"normal","cost":5,"hp":7,"atk":5,"deckCount":0,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],[-2,0],[2,0],[0,-2],[0,2]],"attack":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"abilities":["flight"],"description":"飛行：移動範囲内の空きマスへ、途中の駒を飛び越えて移動できる。"},"遊撃騎兵":{"type":"creature","deckType":"normal","cost":5,"hp":7,"atk":5,"deckCount":0,"move":[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],"attack":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"jump":true,"abilities":[],"description":"縦に2マス・横に1マス、または縦に1マス・横に2マス離れた空きマスへ移動する。途中の駒には影響されない。能力なし。"},"ヒーラー":{"type":"creature","deckType":"normal","cost":2,"hp":1,"atk":1,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"abilities":["heal"],"abilityKinds":{"heal":"activated"},"description":"移動権と攻撃権を消費し、自軍クリーチャー1体または自軍王のHPを1回復する。自分自身も対象にできる。コスト0。移動権と攻撃権が両方未使用の場合のみ使える。クリーチャーは初期HPを超えて回復せず、王はHP20を超えて回復できる。"},"覇王の参謀":{"type":"creature","deckType":"normal","cost":4,"hp":2,"atk":3,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"abilities":["heal_draw"],"triggers":[{"id":"heal_draw","on":"king:healed","controllerEvent":true,"targetKind":"player","unit":{"unitId":"heal_draw","mode":"sequential","targetPolicy":"valid-only","operations":[{"kind":"draw","count":1}]}}],"description":"あなたの王のHPが回復するたび、あなたはカードを1枚引く。"},"求道者":{"type":"creature","deckType":"normal","cost":3,"hp":6,"atk":1,"deckCount":0,"move":[[-1,-1],[-1,0],[-1,1]],"attack":[[-1,-1],[-1,0],[-1,1]],"abilities":["draw_growth"],"triggers":[{"id":"draw_growth","on":"card:drawn","controllerEvent":true,"unit":{"unitId":"draw_growth","mode":"sequential","targetPolicy":"valid-only","operations":[{"kind":"growAttack","amount":1}]}}],"description":"あなたがカードを1枚引くたび、このクリーチャーのATKが1上がる。この上昇は、このクリーチャーが盤上にいる間持続する。"},"密命を受けし者":{"type":"creature","deckType":"normal","cost":3,"hp":3,"atk":2,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"敵陣最奥列に到達した時、「密命を受けし者2」に進化する。","evolution":{"rank":"enemy","to":"密命を受けし者2"}},"密命を受けし者2":{"type":"creature","deckType":"transform","cost":null,"hp":3,"atk":2,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"自陣1段目に到達した時、「密命を受けし者3」に進化する。","evolution":{"rank":"own","to":"密命を受けし者3"}},"密命を受けし者3":{"type":"creature","deckType":"transform","cost":null,"hp":3,"atk":2,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"敵陣最奥列に到達した時、「密命の遂行者」に進化する。","evolution":{"rank":"enemy","to":"密命の遂行者"}},"密命の遂行者":{"type":"creature","deckType":"transform","cost":null,"hp":3,"atk":2,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"このクリーチャーに進化した時、相手の王のHPを0にする。","onEvolution":"defeat_enemy_king"},"占い師":{"type":"creature","deckType":"normal","cost":3,"hp":3,"atk":1,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"攻撃権1回分と2マナを消費し、カードを1枚引く。","abilities":["fortune_draw"],"abilityKinds":{"fortune_draw":"activated"}},"強制的呪術":{"type":"spell","deckType":"normal","cost":2,"deckCount":0,"creaturePair":"opposed","description":"あなたがコントロールするクリーチャー1体と、相手がコントロールするクリーチャー1体を選び、それらを破壊する。"},"ベンケイ":{"type":"creature","deckType":"normal","cost":4,"hp":6,"atk":3,"deckCount":0,"move":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"attack":[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],"description":"通常攻撃後、攻撃対象のクリーチャーのATKを2下げ、自身のATKを2上げる。この増減は、それぞれのクリーチャーが盤上にいる間持続する。","abilities":["attack_exchange_power"],"abilityKinds":{"attack_exchange_power":"triggered"}},"土ゴーレム":{"type":"creature","deckType":"normal","cost":4,"hp":7,"atk":5,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]],"description":"能力なし。"},"ゴーレム使い":{"type":"creature","deckType":"normal","cost":3,"hp":3,"atk":1,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"移動権と攻撃権、および4マナを消費し、このクリーチャーの上下左右いずれかの空きマスに土ゴーレムを1体生成する。移動権と攻撃権が両方未使用の場合のみ使える。","abilities":["generate_golem"],"abilityKinds":{"generate_golem":"activated"},"generatedCreature":"土ゴーレム"},"槍兵":{"type":"creature","deckType":"normal","cost":2,"hp":4,"atk":4,"deckCount":0,"move":[[0,-1],[-1,0],[0,1]],"attack":[[-1,0],[-2,0]],"description":"前方1マスまたは2マス先を攻撃できる。間にクリーチャーがいる場合、その先は攻撃できない。能力なし。","attackObstructed":true},"ゴブリン":{"type":"creature","deckType":"normal","cost":1,"hp":3,"atk":3,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"能力なし。"},"クロスフレイム":{"type":"spell","deckType":"normal","cost":4,"deckCount":0,"targetKind":"cell","description":"盤内のマスを1つ選び、そのマスと上下左右に隣接するマスの全クリーチャーに2点のダメージを与える。敵味方どちらにもダメージを与える。"},"狂信者":{"type":"creature","deckType":"normal","cost":4,"hp":7,"atk":3,"deckCount":0,"move":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]],"attack":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]],"description":"このクリーチャーが通常攻撃で与えたダメージ分、あなたの王のHPを回復する。ただし、攻撃対象の残りHPを超えたダメージは回復量に含めない。","abilities":["attack_heal_king"],"abilityKinds":{"attack_heal_king":"triggered"}},"エネルヴェイト":{"type":"spell","deckType":"normal","cost":3,"deckCount":0,"targetKind":"creature","description":"クリーチャー1体を衰弱状態にする。敵味方どちらも対象にできる。\n(※衰弱状態:自軍ターンの開始時に移動権と攻撃権が回復しない。)"},"チュパカブラ":{"type":"creature","deckType":"normal","cost":3,"hp":4,"atk":1,"deckCount":0,"move":[[-1,-1],[-1,0],[-1,1]],"attack":[[-1,-1],[-1,0],[-1,1]],"description":"通常攻撃後、攻撃したクリーチャーが生存していれば衰弱状態にする。\n(※衰弱状態:自軍ターンの開始時に移動権と攻撃権が回復しない。)","abilities":["attack_paralyze"],"abilityKinds":{"attack_paralyze":"triggered"}},"ポイズンミスト":{"type":"spell","deckType":"normal","cost":4,"deckCount":0,"targetKind":"cell","poisonTurns":4,"description":"盤内のマスを1つ選び、そのマスと上下左右に隣接するマスの全クリーチャーを4ターンの間、毒状態にする。\n(※毒状態:自軍ターン開始時に1点のダメージを受ける。追加で毒状態になる場合、毒状態の継続ターン数が加算される。)"},"崩れゆく巨像":{"type":"creature","deckType":"normal","cost":7,"hp":9,"atk":9,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,0]],"description":"あなたのターン終了時、このクリーチャーは衰弱状態になる。\n(※衰弱状態:自軍ターンの開始時に移動権と攻撃権が回復しない。)","abilities":["colossus_weaken"],"triggers":[{"id":"colossus_weaken","on":"turn:ended","controllerEvent":true,"unit":{"unitId":"colossus_weaken","mode":"sequential","targetPolicy":"valid-only","operations":[{"kind":"weaken"}]}}]},"献身的なガーディアン":{"type":"creature","deckType":"normal","cost":4,"hp":6,"atk":1,"deckCount":0,"move":[[-1,0],[0,-1],[0,1],[1,0]],"attack":[[-1,0],[0,-1],[0,1],[1,0]],"description":"上下左右に隣接する自軍クリーチャーがダメージを受ける場合、そのダメージを全て肩代わりする。","abilities":["guard_damage"]}},versions:{"protocol":"card-tactics-b4-match-v1","core":"417ec9798f48c82423af1e97730de4a8d5fb554d1cfdcfea5f1da77bce41afe3","cards":"bb651f5a44dfc20febead4b48dc856b7a0a5ce2ca250ef7af4e6d7e2f317bbef"}};})();
