'use strict';
// The normal presenter consumes the authenticated owner view only. GameCore on
// the host remains the sole source of legal actions, effects and confirmed state.
(()=>{
 const $=id=>document.getElementById(id),D=B2Runtime.definitions,C=B2Runtime.Core,N=NormalGameUI;
 N.createVisualSettings({includeCPU:false});const updateHandScroll=N.bindHandScroll(),updateInfoScroll=N.bindInfoScroll();
 const opposite=s=>s==='p'?'c':'p';
 let state=null,selected=null,source=null,target=null,mode='combat',lastRevision=null,lastStatus=null,hadMatch=false,renderedRevision=null,renderGeneration=0;
 function clear(){if($('infoContent'))$('infoContent').scrollTop=0;selected=null;source=null;target=null;mode='combat';}
 const usable=()=>!!state?.view&&state.status==='connected'&&!state.inFlight&&!state.view.gameOver&&!state.aborted;
 // Presentation only: the existing usable()/submit guards remain authoritative.
 let responseTimer=null,responseSlow=false;
 const awaitingResponse=()=>!!state?.view&&state.status==='connected'&&state.inFlight&&!state.view.gameOver&&!state.aborted&&!state.view.surrenderPending;
 function renderRequestStatus(){
  const awaiting=awaitingResponse(),label=$('requestStatus');
  $('match').classList.toggle('awaiting-response',awaiting);$('match').setAttribute('aria-busy',String(awaiting));
  if(!awaiting){clearTimeout(responseTimer);responseTimer=null;responseSlow=false;}
  else if(responseTimer===null&&!responseSlow)responseTimer=setTimeout(()=>{responseTimer=null;if(awaitingResponse()){responseSlow=true;renderRequestStatus();}},1500);
  label.textContent=awaiting?(responseSlow?'応答待ち・操作停止中':'送信中…'):'';
  label.classList.toggle('slow-response',awaiting&&responseSlow);
 }

 function button(text,fn,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;b.onclick=fn;return b;}
 function choose(o){if(o&&usable())B3Poc.choose(o.choiceId);}
 function belongs(o,v){const a=o.action;if(v.choice)return ['chooseTokenCell','choosePromotion'].includes(a.type);if(!selected)return false;
  if(selected.kind==='card')return a.instanceId===selected.id;
  if(selected.kind==='piece')return (a.from===selected.cell||a.sourceInstanceId===v.board[selected.cell]?.sourceInstanceId)&&(mode==='ability'?a.type==='activate_ability':['move','attack_creature','attack_king'].includes(a.type));
  return selected.kind==='king'&&selected.side===v.viewer&&mode==='ability'&&a.abilityId==='awaken_attack';
 }
 const atCell=(a,k,v)=>a.to===k||a.target?.kind==='cell'&&a.target.k===k||a.target?.kind==='creature'&&v.board[k]?.sourceInstanceId===a.target.instanceId&&a.cardId!=='転移魔法';
 const atKing=(a,s)=>a.type==='attack_king'&&s!==state.view.viewer||['king','player'].includes(a.target?.kind)&&a.target.side===s;
 function options(){const v=state.view;return v.options.filter(o=>belongs(o,v)&&(!source||o.action.target?.instanceId===source)&&(!target||target(o.action)));}
 function pickCard(c){if(!state?.view||state.view.choice)return;const same=selected?.kind==='card'&&selected.id===c.instanceId;clear();if(!same)selected={kind:'card',id:c.instanceId,cardId:c.cardId};render(state);}
 function cell(k){if(!state?.view)return;const v=state.view;
  if(usable()){
   if(selected?.kind==='card'&&selected.cardId==='転移魔法'&&!source){const id=v.board[k]?.sourceInstanceId;if(id&&options().some(o=>o.action.target?.instanceId===id)){source=id;target=null;render(state);return;}}
   const matches=options().filter(o=>atCell(o.action,k,v));
   if(matches.length===1){choose(matches[0]);return;}
   if(matches.length>1){target=a=>atCell(a,k,v);render(state);return;}
   if(v.choice)return;
  }
  clear();selected=v.board[k]?{kind:'piece',cell:k}:{kind:'cell',cell:k};render(state);
 }
 function king(side){if(!state?.view)return;
  if(usable()){let matches=options().filter(o=>atKing(o.action,side));if(selected?.kind==='card'&&selected.cardId==='マナ'&&side===state.view.viewer)matches=options();
   if(matches.length===1){choose(matches[0]);return;}if(matches.length>1){target=a=>atKing(a,side);render(state);return;}if(state.view.choice)return;}
  clear();selected={kind:'king',side};render(state);
 }
 function addChoice(parent,o,text){const b=button(text,()=>choose(o),!usable());b.className='useCardButton';b.dataset.choice=o.choiceId;b.dataset.action=o.action.type;if(o.action.cardId)b.dataset.card=o.action.cardId;parent.append(b);}
 function effectName(a){const e=state.view.enchantments.find(e=>e.instanceId===a.effectId);return e?e.cardId+' 残り'+e.remainingTurns+'ターン':a.effectId?'一時効果を解除':'対象に使用';}
 function renderInfo(){const v=state?.view;if(!v)return;const oldInfoScroll=$('infoContent').scrollTop;const info=$('infoContent'),actions=$('actions');info.replaceChildren();actions.replaceChildren();
  const line=text=>{const e=document.createElement('div');e.className='infoLine';e.textContent=text;info.append(e);};
  const title=text=>{const e=document.createElement('div');e.className='infoName';e.textContent=text;info.append(e);};
  const description=id=>{if(D[id]?.description){const e=document.createElement('div');e.className='infoEffect';e.textContent=D[id].description;info.append(e);}};
  const range=p=>{const e=document.createElement('div');e.innerHTML=N.rangePair(p,(piece,kind)=>C.combatPattern(piece,D,kind,{enchantments:v.enchantments}));info.append(e);};
  if(v.choice){title(v.choice.kind==='promotion'?'進化を選んでください':'バリケードの配置先');line(v.choice.kind==='promotion'?'進化するか選択してください。':'緑色の空きマスを選んでください。');}
  else if(selected?.kind==='card'){const d=D[selected.cardId];title(selected.cardId);line((d.type==='creature'?'クリーチャー':d.type==='spell'?'スペル':'エンチャント')+' / コスト '+d.cost);if(d.type==='creature'){line('ATK '+d.atk+' / HP '+d.hp);range({type:selected.cardId,side:v.viewer,berserk:0});}description(selected.cardId);line(!usable()?'通信・処理の確定待ちのため操作停止中。':v.activeSide!==v.viewer?'相手の手番です。カードの情報を確認できます。':d.type==='spell'&&C.spellsBlocked(v,v.viewer)?'🔒 封魔中：カードの情報は確認できますが、スペルは使用できません。':d.cost>v.players[v.viewer].mana?`必要マナ ${d.cost} / 現在 ${v.players[v.viewer].mana}：マナ不足のため使用不可`:options().length?(source?'転移先の空きマスをタップしてください。':'色の付いた対象をタップして使用。再タップで選択解除。'):'現在使用できる対象がありません。');}
  else if(selected?.kind==='piece'&&v.board[selected.cell]){const p=v.board[selected.cell],d=D[p.type],power=C.powerForPiece(v,p,D),limit=C.attackLimit(p,D,v);info.innerHTML=N.creatureInfoHTML({piece:p,viewer:v.viewer,definition:d,power:{...power,total:v.power[selected.cell]},limit,range:N.rangePair(p,(piece,kind)=>C.combatPattern(piece,D,kind,v)),description:d.description,berserkDescription:D.バーサーク.description,cellEffects:v.enchantments.filter(e=>e.target?.k===selected.cell).map(e=>({...e,description:D[e.cardId]?.description}))});
   for(const e of v.enchantments.filter(e=>e.target?.kind==='creature'&&e.target.instanceId===p.sourceInstanceId)){line(e.cardId+' 残り'+e.remainingTurns+'ターン');if(e.cardId!=='バーサーク')description(e.cardId);}
   if(p.side===v.viewer&&C.effectiveAbilities(p,D,v).includes('sorcerer_bolt')){line('魔法：攻撃権＋マナ2で、盤上の任意のクリーチャー／王に2ダメージ');if(v.activeSide!==v.viewer)line('相手の手番です。');else if(!C.combatRights(p,D,v).attack)line('攻撃済みのため魔法は使用できません。');else if(v.players[v.viewer].mana<2)line(`必要マナ 2 / 現在 ${v.players[v.viewer].mana}：マナ不足のため使用不可`);}
   const abilities=v.options.filter(o=>o.action.type==='activate_ability'&&o.action.sourceInstanceId===p.sourceInstanceId);if(abilities.length){const b=button(mode==='ability'?'魔法の選択を解除':'魔法を使用',()=>{mode=mode==='ability'?'combat':'ability';target=null;render(state);},!usable());b.id='useAbility';b.className='useCardButton';actions.append(b);}
  }
  else if(selected?.kind==='king'){const own=selected.side===v.viewer,p=v.players[selected.side];title(own?'あなたの王':'相手の王');if(C.spellsBlocked(v,selected.side))line('🔒 封魔：スペル使用不可（次のターン終了まで）');line('HP '+p.kingHp+' / 20');line('マナ '+p.mana+' / '+p.maxMana);for(const e of v.enchantments.filter(e=>e.target?.side===selected.side)){line(e.cardId+' 残り'+e.remainingTurns+'ターン');description(e.cardId);}line('通常の王への攻撃対象は盤外の中央3列。');const awakened=v.enchantments.some(e=>e.cardId==='王の覚醒'&&e.target?.side===selected.side&&e.remainingTurns>0);if(awakened){line(`王の攻撃：${v.kingAction[selected.side]?.awaken_attack||0}/1回（攻撃力5）`);if(v.kingAction[selected.side]?.awaken_attack)line('このターンは攻撃済み');}if(own&&v.options.some(o=>o.action.abilityId==='awaken_attack')){const b=button(mode==='ability'?'王の攻撃を解除':'攻撃',()=>{mode=mode==='ability'?'combat':'ability';render(state);},!usable());b.id='useAbility';b.className='useCardButton';actions.append(b);}}
  else if(selected?.kind==='grave'){info.innerHTML=N.graveyardHTML(v.players[selected.side].graveyard,selected.side===v.viewer?'あなた':'相手');}
  else if(selected?.kind==='effects'){info.innerHTML=N.globalEffectsHTML(v.enchantments.filter(e=>e.target?.kind==='global'));}
  else if(selected?.kind==='effect-detail'){const e=v.enchantments.find(e=>String(e.instanceId)===String(selected.id)&&e.target?.kind==='global');info.innerHTML=N.globalDetailHTML(e,D[e?.cardId],D[e?.cardId]?.description);}
  else if(selected?.kind==='cell'){title((Math.floor(selected.cell/5)+1)+'行 '+(selected.cell%5+1)+'列');if(!v.enchantments.some(e=>e.target?.k===selected.cell))line('確認できるエンチャントはありません。');for(const e of v.enchantments.filter(e=>e.target?.k===selected.cell)){line(e.cardId+' 残り'+e.remainingTurns+'ターン');description(e.cardId);}}
  else line('カード・駒・空きマス・王をタップすると、ここに情報を表示します。');
  for(const o of options()){const a=o.action;
   if(a.type==='choosePromotion')addChoice(actions,o,a.accept?'進化する':'進化しない');
   else if(target&&selected?.cardId==='解呪')addChoice(actions,o,effectName(a));
   else if(a.target?.kind==='global'||!a.target&&a.type==='play_spell'){
    if(selected?.cardId==='解呪'){if(!actions.querySelector('[data-global]')){const b=button('盤面全体を対象にする',()=>{target=a=>a.target?.kind==='global';render(state);},!usable());b.className='useCardButton';b.dataset.global='true';actions.append(b);}}
    else addChoice(actions,o,'使用する');
   }
  }
  const imageType=selected?.kind==='piece'?v.board[selected.cell]?.type:selected?.kind==='card'&&D[selected.cardId].type==='creature'?selected.cardId:null;
  info.scrollTop=oldInfoScroll;updateInfoScroll();
  if(imageType){const asset=N.requestCreatureAsset(imageType);if(asset?.status==='loaded'){const img=document.createElement('img');img.className='infoCreatureBackdrop';img.alt='';img.src=asset.image.src;info.prepend(img);}}
 }
 function drawPieces(){const v=state?.view;if(!v)return;N.renderPieces({board:v.board,viewer:v.viewer,rights:p=>C.combatRights(p,D,{enchantments:v.enchantments}),power:k=>v.power[k],redrawInfo:renderInfo,afterRender:restoreHits,enchantVisual:p=>{const cards=v.enchantments.filter(e=>e.target?.kind==='creature'&&e.target.instanceId===p.sourceInstanceId);return cards.length?{cards,colors:[...new Set(cards.map(e=>D[e.cardId]?.visual?.auraColor||'#b985ff'))]}:null;}});const column=document.querySelector('.boardColumn');if(column?.offsetHeight)$('infoPanel').style.setProperty('--panel-height',column.getBoundingClientRect().height+'px');}
 function render(current){const priorView=state?.view;if(priorView&&current.view?.revision!==priorView.revision)presentationBefore=priorView.board;state=current;globalThis.CardTacticsBGM?.setActive(!!current.view&&!current.view.gameOver&&!current.aborted);renderRequestStatus();const waiting=!!current.waitingRecovery;$('recoveryExit').hidden=!waiting;if(!waiting&&$('recoveryExitDialog').open)$('recoveryExitDialog').close();const v=current.view;$('match').hidden=!v;document.body.classList.toggle('online-playing',!!v);if(!v){$('turnIndicator').hidden=true;$('settingsOverlay').classList.remove('show');$('settingsOverlay').setAttribute('aria-hidden','true');clear();N.clear();$('overlay').classList.remove('show');lastRevision=null;lastStatus=null;hadMatch=false;if($('surrenderDialog').open)$('surrenderDialog').close();for(const id of ['board','pieceOverlay','hand','enemyHand','actions','infoContent','result'])$(id).replaceChildren();$('matchStatus').textContent='';$('log').replaceChildren();logSeen.clear();hitEffects.clear();clearTimeout(hitCleanup);hitCleanup=null;presentationBefore=null;renderedRevision=null;return;}
  if(!hadMatch){$('connectionPanel').open=false;hadMatch=true;}
  if(v.revision!==lastRevision||current.status!==lastStatus||current.inFlight)clear();lastRevision=v.revision;lastStatus=current.status;
  const enemy=opposite(v.viewer),own=v.players[v.viewer],other=v.players[enemy],enabled=usable();
  $('assignment').textContent=(current.role==='host'?'ホスト':'ゲスト')+' / '+(v.viewer==='p'?'先攻（p）':'後攻（c）');$('turn').textContent='ターン '+v.turn+' / '+(v.activeSide===v.viewer?'あなたの手番':'相手の手番');$('ownDeck').textContent='自分山札 '+own.deckCount;$('enemyDeck').textContent='相手山札 '+other.deckCount;$('enemyHand').textContent='相手手札 '+(v.hands[enemy]?.length??0)+'枚';$('globalEnchantCount').textContent=v.enchantments.filter(e=>e.target?.kind==='global').length;
  for(const [id,value]of Object.entries({ownHp:own.kingHp,enemyHp:other.kingHp,ownMana:own.mana+'/'+own.maxMana,enemyMana:other.mana+'/'+other.maxMana,ownGrave:own.graveyard.length,enemyGrave:other.graveyard.length}))$(id).textContent=value;
  $('ownKing').textContent='あなたの王 HP '+own.kingHp;$('enemyKing').textContent='相手の王 HP '+other.kingHp;
  for(const e of document.querySelectorAll('[data-king]')){const side=e.dataset.king==='own'?v.viewer:enemy;if(e.tagName==='BUTTON')e.disabled=!enabled;e.onclick=()=>king(side);e.classList.toggle('spellTarget',enabled&&options().some(o=>atKing(o.action,side)));e.classList.toggle('attackable',enabled&&options().some(o=>o.action.type==='attack_king'&&side===enemy));}
  for(const e of document.querySelectorAll('[data-grave]'))e.onclick=()=>{clear();selected={kind:'grave',side:e.dataset.grave==='own'?v.viewer:enemy};render(state);};
  $('showEffects').onclick=()=>{clear();selected={kind:'effects'};render(state);};
  const opts=options(),board=$('board'),combat=enabled&&selected?.kind==='piece'&&mode==='combat'?C.queryCombat(v,selected.cell,v.activeSide,D):null;board.replaceChildren();for(let i=0;i<25;i++){const k=v.viewer==='p'?i:24-i,p=v.board[k],e=button('',()=>cell(k),!enabled);e.className='cell';e.dataset.cell=k;e.setAttribute('aria-label',(Math.floor(k/5)+1)+'行'+(k%5+1)+'列'+(p?' '+p.type+' HP '+p.hp+' ATK '+v.power[k]:''));e.setAttribute('aria-disabled',String(!enabled));
   if(selected?.kind==='piece'&&selected.cell===k)e.classList.add('selected');const at=enabled?opts.filter(o=>atCell(o.action,k,v)):[],move=at.some(o=>o.action.type==='move'),attack=at.some(o=>['attack_creature','activate_ability'].includes(o.action.type));if(at.length)e.classList.add('legal');const previewMove=!!combat?.moves.includes(k),previewAttack=!!combat?.attackRange.includes(k);if(previewMove||previewAttack)e.classList.add(previewMove&&previewAttack?'bothTarget':previewMove?'moveTarget':'attackTarget');else if(at.length)e.classList.add(move&&attack?'bothTarget':move?'moveTarget':attack?'attackTarget':at.some(o=>['summon','chooseTokenCell'].includes(o.action.type))?'summonTarget':'spellTarget');
   if(v.enchantments.some(x=>x.cardId==='マイン'&&x.owner===v.viewer&&x.target?.k===k))e.classList.add('mineCell','ownMine');if(v.enchantments.some(x=>x.target?.k===k))e.classList.add('cellEnchanted');board.append(e);
  }
  const hand=$('hand'),handScroll=hand.scrollLeft;hand.replaceChildren();for(const card of v.ownHand){const d=D[card.cardId],e=button('',()=>pickCard(card),!enabled||!!v.choice);e.className='card'+(d.type==='spell'?' spell':d.type==='enchant'?' enchant':'')+(selected?.id===card.instanceId?' selected':'');e.dataset.card=card.cardId;e.dataset.instance=card.instanceId;e.innerHTML=N.cardHTML(card.cardId,d,{spell:d.type==='spell',enchant:d.type==='enchant',text:d.description});hand.append(e);}
  hand.scrollLeft=handScroll;updateHandScroll();N.renderTurn({activeSide:v.activeSide,viewer:v.viewer,paused:current.status!=='connected'||v.surrenderPending,ended:v.gameOver||current.aborted});
  $('selection').textContent=v.choice?(v.choice.kind==='promotion'?'進化を選んでください':'バリケードの配置先を選んでください'):selected?.kind==='card'?selected.cardId+(source?'：転移先を選択':'：色の付いた対象を選択'):mode==='ability'?'能力：対象の駒・王をタップ':selected?.kind==='piece'?'移動先・攻撃対象・王を選べます。':'カード・駒・王を選択してください';
  $('matchStatus').textContent=['match-recovering','resyncing'].includes(current.status)?$('recovery').textContent:current.aborted?'復帰期限到達・勝敗なし中止':v.surrenderPending?'投了要求を受け付けました。安全な処理境界で結果を確定します。':'';
  const end=v.options.find(o=>o.action.type==='end_turn'),surrender=v.options.find(o=>o.action.type==='surrender');$('endTurn').disabled=!enabled||!end;$('endTurn').onclick=()=>choose(end);$('onlineSurrender').disabled=!enabled||!surrender||v.surrenderPending;$('onlineSurrender').onclick=()=>{$('surrenderDialog').showModal();$('continueMatch').focus();};$('continueMatch').onclick=()=>$('surrenderDialog').close();$('confirmSurrender').onclick=()=>{$('surrenderDialog').close();choose(surrender);};
  $('overlay').classList.toggle('show',v.gameOver||!!current.aborted);$('resultTitle').hidden=!v.gameOver&&!current.aborted;$('result').textContent=v.gameOver?(v.outcome.draw?'引き分け':v.winner===v.viewer?'勝利':'敗北')+' / '+v.outcome.reason:v.surrenderPending?'投了要求を受け付けました。安全な処理境界で結果を確定します。':'';if(current.aborted&&!v.gameOver)$('result').textContent='勝敗なしで中止（復帰期限到達）。この端末で未受信の相手の確定結果は確認できません。';if((v.gameOver||current.aborted)&&$('surrenderDialog').open)$('surrenderDialog').close();
  renderInfo();drawPieces();renderedRevision=v.revision;renderGeneration++;$('board').dataset.renderedRevision=String(v.revision);
 }
 $('infoContent').addEventListener('click',e=>{const b=e.target.closest('[data-effect-detail]');if(b){selected={kind:'effect-detail',id:b.dataset.effectDetail};$('infoContent').scrollTop=0;render(state);}if(e.target.closest('[data-effects-back]')){selected={kind:'effects'};$('infoContent').scrollTop=0;render(state);}});
 const logSeen=new Set(),hitEffects=new Map();let hitSequence=0,hitCleanup=null,presentationBefore=null;
 function restoreHits(){for(const [key,fx]of hitEffects){const remaining=fx.until-performance.now();if(remaining<=0){hitEffects.delete(key);continue;}const element=fx.cell!==undefined?document.querySelector(`#pieceOverlay [data-cell="${fx.cell}"]`)||document.querySelector(`#board [data-cell="${fx.cell}"]`):$(fx.side===state?.view?.viewer?'playerPedestal':'enemyPedestal');N.hitBurst(element,{id:fx.id,remaining});}}
 function present(events,revision){const v=state?.view;if(!v||revision!==v.revision||logSeen.has(revision))return;logSeen.add(revision);if(logSeen.size>200)logSeen.delete(logSeen.values().next().value);const log=$('log'),side=s=>s===v.viewer?'あなた':'相手';for(const e of events){let text=null;
  if(e.type==='card:played')text=side(e.side)+'：'+e.cardId+'を使用';
  else if(e.type==='turn:started')text=side(e.side)+'のターン開始';
  else if(e.type==='creature:moved')text=(presentationBefore?.[e.from]?.type||'クリーチャー')+'が移動';
  else if(e.type==='creature:attack-resolved')text=(presentationBefore?.[e.from]?.type||'クリーチャー')+'が'+(e.to==null?'王':presentationBefore?.[e.to]?.type||'クリーチャー')+'を攻撃（-'+e.amount+'）';
  else if(e.type==='creature:ability-used'||e.type==='king:ability-used')text=side(e.side)+'：能力を使用';
  else if(e.type==='king:damaged')text=side(e.side)+'の王に'+e.amount+'ダメージ（HP '+e.hp+'）';
  else if(e.type==='dispel:resolved')text=side(e.side)+'：解呪';
  else if(e.type==='game:over')text='対戦終了：'+e.reason;
  if(text){const row=document.createElement('div');row.textContent=text;row.dataset.revision=revision;log.append(row);while(log.children.length>100)log.firstChild.remove();}
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&(e.type==='creature:attack-resolved'&&e.to!==null&&e.to!==undefined&&e.amount>0||e.type==='king:damaged'&&e.amount>0)){const key=e.type==='king:damaged'?'king-'+e.side:'cell-'+e.to;hitEffects.set(key,{id:'online-'+(++hitSequence),until:performance.now()+710,...(e.type==='king:damaged'?{side:e.side}:{cell:e.to})});}
 }if(presentationBefore){const already=new Set(events.filter(e=>e.type==='creature:attack-resolved').map(e=>e.to));for(const [from,p]of presentationBefore.entries()){if(!p)continue;const to=v.board.findIndex(q=>q?.sourceInstanceId===p.sourceInstanceId),next=to>=0?v.board[to]:null;if(next&&next.hp>=p.hp)continue;const text=next?`${p.type}のHP ${p.hp}→${next.hp}`:`${p.type}が戦場から離れました`;if(!already.has(to)){const row=document.createElement('div');row.textContent=text;row.dataset.revision=revision;log.append(row);}const cell=to>=0?to:from;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)hitEffects.set('cell-'+cell,{id:'online-'+(++hitSequence),until:performance.now()+710,cell});}}while(log.children.length>100)log.firstChild.remove();log.scrollTop=log.scrollHeight;restoreHits();clearTimeout(hitCleanup);hitCleanup=setTimeout(()=>{hitCleanup=null;restoreHits();},730);}
 $('stopRecovery').onclick=()=>{if(!state?.waitingRecovery)return;$('recoveryExitDialog').showModal();$('continueRecovery').focus();};
 $('continueRecovery').onclick=()=>$('recoveryExitDialog').close();
 $('confirmRecoveryExit').onclick=()=>{if(!B3Poc.inspect().matchRecovering||B3Poc.inspect().view?.gameOver){$('recoveryExitDialog').close();return;}globalThis.CardTacticsBGM?.setActive(false);B3Poc.leave();sessionStorage.removeItem('cardTacticsStartInGame');location.href='../';};
 $('lobbyTitle').onclick=()=>{if(state?.view)return;globalThis.CardTacticsBGM?.setActive(false);B3Poc.leave();sessionStorage.removeItem('cardTacticsStartInGame');location.href='../';};
 $('resultTitle').onclick=()=>{globalThis.CardTacticsBGM?.setActive(false);B3Poc.leave();sessionStorage.removeItem('cardTacticsStartInGame');location.href='../';};
 window.addEventListener('resize',drawPieces);window.addEventListener('orientationchange',()=>requestAnimationFrame(drawPieces));if(typeof ResizeObserver!=='undefined')new ResizeObserver(drawPieces).observe($('board'));
 globalThis.B3UI={render,present,notice(text){if(!state?.view)return;const log=$('log'),row=document.createElement('div');row.textContent=text;log.append(row);while(log.children.length>100)log.firstChild.remove();log.scrollTop=log.scrollHeight;},renderState:()=>({revision:renderedRevision,generation:renderGeneration})};
})();
