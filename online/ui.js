'use strict';
// The normal presenter consumes the authenticated owner view only. GameCore on
// the host remains the sole source of legal actions, effects and confirmed state.
(()=>{
 const $=id=>document.getElementById(id),D=B2Runtime.definitions,C=B2Runtime.Core,N=NormalGameUI;
 const opposite=s=>s==='p'?'c':'p';
 let state=null,selected=null,source=null,target=null,mode='combat',lastRevision=null,lastStatus=null,hadMatch=false;
 function clear(){selected=null;source=null;target=null;mode='combat';}
 const usable=()=>!!state?.view&&state.status==='connected'&&!state.inFlight&&!state.view.gameOver&&!state.aborted;
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
 function renderInfo(){const v=state?.view;if(!v)return;const info=$('infoContent'),actions=$('actions');info.replaceChildren();actions.replaceChildren();
  const line=text=>{const e=document.createElement('div');e.className='infoLine';e.textContent=text;info.append(e);};
  const title=text=>{const e=document.createElement('div');e.className='infoName';e.textContent=text;info.append(e);};
  const description=id=>{if(D[id]?.description){const e=document.createElement('div');e.className='infoEffect';e.textContent=D[id].description;info.append(e);}};
  const range=p=>{const e=document.createElement('div');e.innerHTML=N.rangePair(p,(piece,kind)=>C.combatPattern(piece,D,kind,{enchantments:v.enchantments}));info.append(e);};
  if(v.choice){title(v.choice.kind==='promotion'?'進化を選んでください':'バリケードの配置先');line(v.choice.kind==='promotion'?'進化するか選択してください。':'緑色の空きマスを選んでください。');}
  else if(selected?.kind==='card'){const d=D[selected.cardId];title(selected.cardId);line((d.type==='creature'?'クリーチャー':d.type==='spell'?'スペル':'エンチャント')+' / コスト '+d.cost);if(d.type==='creature'){line('ATK '+d.atk+' / HP '+d.hp);range({type:selected.cardId,side:v.viewer,berserk:0});}description(selected.cardId);line(options().length?(source?'転移先の空きマスをタップしてください。':'色の付いた対象をタップして使用。再タップで選択解除。'):'現在使用できません（手番・マナ・封魔・処理待ちを確認）。');}
  else if(selected?.kind==='piece'&&v.board[selected.cell]){const p=v.board[selected.cell],d=D[p.type];title(p.type);line((p.side===v.viewer?'自軍':'敵軍')+' / コスト '+d.cost);line('HP '+p.hp+' / '+d.hp+'　ATK '+v.power[selected.cell]);const rights=C.combatRights(p,D,{enchantments:v.enchantments});line('🔵 移動 '+(rights.move?'可':'済')+' / 🔴 攻撃 '+(rights.attack?'可':'済'));range(p);description(p.type);for(const e of v.enchantments.filter(e=>e.target?.instanceId===p.sourceInstanceId||e.target?.k===selected.cell))line(e.cardId+' 残り'+e.remainingTurns+'ターン');
   const abilities=v.options.filter(o=>o.action.type==='activate_ability'&&o.action.sourceInstanceId===p.sourceInstanceId);if(abilities.length){const b=button(mode==='ability'?'魔法の選択を解除':'魔法を使用',()=>{mode=mode==='ability'?'combat':'ability';target=null;render(state);},!usable());b.id='useAbility';b.className='useCardButton';actions.append(b);}
  }
  else if(selected?.kind==='king'){const own=selected.side===v.viewer,p=v.players[selected.side];title(own?'あなたの王':'相手の王');line('HP '+p.kingHp+' / 20');line('マナ '+p.mana+' / '+p.maxMana);for(const e of v.enchantments.filter(e=>e.target?.side===selected.side)){line(e.cardId+' 残り'+e.remainingTurns+'ターン');description(e.cardId);}if(own&&v.options.some(o=>o.action.abilityId==='awaken_attack')){const b=button(mode==='ability'?'王の攻撃を解除':'攻撃',()=>{mode=mode==='ability'?'combat':'ability';render(state);},!usable());b.id='useAbility';b.className='useCardButton';actions.append(b);}}
  else if(selected?.kind==='grave'){title((selected.side===v.viewer?'あなた':'相手')+'の墓地');for(const c of v.players[selected.side].graveyard)line(c.cardId);}
  else if(selected?.kind==='effects'){title('全体エンチャント');for(const e of v.enchantments.filter(e=>e.target?.kind==='global')){line(e.cardId+' 残り'+e.remainingTurns+'ターン');description(e.cardId);}}
  else if(selected?.kind==='cell'){title((Math.floor(selected.cell/5)+1)+'行 '+(selected.cell%5+1)+'列');for(const e of v.enchantments.filter(e=>e.target?.k===selected.cell)){line(e.cardId+' 残り'+e.remainingTurns+'ターン');description(e.cardId);}}
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
  if(imageType){const asset=N.requestCreatureAsset(imageType);if(asset?.status==='loaded'){const img=document.createElement('img');img.className='infoCreatureBackdrop';img.alt='';img.src=asset.image.src;info.prepend(img);}}
 }
 function drawPieces(){const v=state?.view;if(!v)return;N.renderPieces({board:v.board,viewer:v.viewer,rights:p=>C.combatRights(p,D,{enchantments:v.enchantments}),power:k=>v.power[k],redrawInfo:renderInfo,enchantVisual:p=>{const cards=v.enchantments.filter(e=>e.target?.kind==='creature'&&e.target.instanceId===p.sourceInstanceId);return cards.length?{cards,colors:[...new Set(cards.map(e=>D[e.cardId]?.visual?.auraColor||'#b985ff'))]}:null;}});const column=document.querySelector('.boardColumn');if(column?.offsetHeight)$('infoPanel').style.setProperty('--panel-height',column.getBoundingClientRect().height+'px');}
 function render(current){state=current;const v=current.view;$('match').hidden=!v;document.body.classList.toggle('online-playing',!!v);if(!v){clear();N.clear();$('overlay').classList.remove('show');lastRevision=null;lastStatus=null;hadMatch=false;if($('surrenderDialog').open)$('surrenderDialog').close();for(const id of ['board','pieceOverlay','hand','enemyHand','actions','infoContent','result'])$(id).replaceChildren();$('matchStatus').textContent='';return;}
  if(!hadMatch){$('connectionPanel').open=false;hadMatch=true;}
  if(v.revision!==lastRevision||current.status!==lastStatus||current.inFlight)clear();lastRevision=v.revision;lastStatus=current.status;
  const enemy=opposite(v.viewer),own=v.players[v.viewer],other=v.players[enemy],enabled=usable();
  $('assignment').textContent=(current.role==='host'?'ホスト':'ゲスト')+' / '+(v.viewer==='p'?'先攻（p）':'後攻（c）');$('turn').textContent='ターン '+v.turn+' / '+(v.activeSide===v.viewer?'あなたの手番':'相手の手番');$('ownDeck').textContent='自分山札 '+own.deckCount;$('enemyDeck').textContent='相手山札 '+other.deckCount;$('enemyHand').textContent='相手手札 '+(v.hands[enemy]?.length??0)+'枚';$('globalEnchantCount').textContent=v.enchantments.filter(e=>e.target?.kind==='global').length;
  for(const [id,value]of Object.entries({ownHp:own.kingHp,enemyHp:other.kingHp,ownMana:own.mana+'/'+own.maxMana,enemyMana:other.mana+'/'+other.maxMana,ownGrave:own.graveyard.length,enemyGrave:other.graveyard.length}))$(id).textContent=value;
  $('ownKing').textContent='あなたの王 HP '+own.kingHp;$('enemyKing').textContent='相手の王 HP '+other.kingHp;
  for(const e of document.querySelectorAll('[data-king]')){const side=e.dataset.king==='own'?v.viewer:enemy;if(e.tagName==='BUTTON')e.disabled=!enabled;e.onclick=()=>king(side);e.classList.toggle('spellTarget',enabled&&options().some(o=>atKing(o.action,side)));e.classList.toggle('attackable',enabled&&options().some(o=>o.action.type==='attack_king'&&side===enemy));}
  for(const e of document.querySelectorAll('[data-grave]'))e.onclick=()=>{clear();selected={kind:'grave',side:e.dataset.grave==='own'?v.viewer:enemy};render(state);};
  $('showEffects').onclick=()=>{clear();selected={kind:'effects'};render(state);};
  const opts=options(),board=$('board');board.replaceChildren();for(let i=0;i<25;i++){const k=v.viewer==='p'?i:24-i,p=v.board[k],e=button('',()=>cell(k),!enabled);e.className='cell';e.dataset.cell=k;e.setAttribute('aria-label',(Math.floor(k/5)+1)+'行'+(k%5+1)+'列'+(p?' '+p.type+' HP '+p.hp+' ATK '+v.power[k]:''));e.setAttribute('aria-disabled',String(!enabled));
   if(selected?.kind==='piece'&&selected.cell===k)e.classList.add('selected');const at=enabled?opts.filter(o=>atCell(o.action,k,v)):[],move=at.some(o=>o.action.type==='move'),attack=at.some(o=>['attack_creature','activate_ability'].includes(o.action.type));if(at.length){e.classList.add('legal',move&&attack?'bothTarget':move?'moveTarget':attack?'attackTarget':at.some(o=>['summon','chooseTokenCell'].includes(o.action.type))?'summonTarget':'spellTarget');}
   if(v.enchantments.some(x=>x.cardId==='マイン'&&x.owner===v.viewer&&x.target?.k===k))e.classList.add('mineCell','ownMine');if(v.enchantments.some(x=>x.target?.k===k))e.classList.add('cellEnchanted');board.append(e);
  }
  const hand=$('hand');hand.replaceChildren();for(const card of v.ownHand){const d=D[card.cardId],e=button('',()=>pickCard(card),!enabled||!!v.choice);e.className='card'+(d.type==='spell'?' spell':d.type==='enchant'?' enchant':'')+(selected?.id===card.instanceId?' selected':'');e.dataset.card=card.cardId;e.dataset.instance=card.instanceId;e.innerHTML=N.cardHTML(card.cardId,d,{spell:d.type==='spell',enchant:d.type==='enchant',text:d.description});hand.append(e);}
  $('selection').textContent=v.choice?(v.choice.kind==='promotion'?'進化を選んでください':'バリケードの配置先を選んでください'):selected?.kind==='card'?selected.cardId+(source?'：転移先を選択':'：色の付いた対象を選択'):mode==='ability'?'能力：対象の駒・王をタップ':selected?.kind==='piece'?'移動先・攻撃対象・王を選べます。':'カード・駒・王を選択してください';
  $('matchStatus').textContent=['match-recovering','resyncing'].includes(current.status)?$('recovery').textContent:current.inFlight?'要求の確定待ち・操作停止':current.aborted?'復帰期限到達・勝敗なし中止':v.surrenderPending?'投了要求を受け付けました。安全な処理境界で結果を確定します。':'';
  const end=v.options.find(o=>o.action.type==='end_turn'),surrender=v.options.find(o=>o.action.type==='surrender');$('endTurn').disabled=!enabled||!end;$('endTurn').onclick=()=>choose(end);$('onlineSurrender').disabled=!enabled||!surrender||v.surrenderPending;$('onlineSurrender').onclick=()=>{$('surrenderDialog').showModal();$('continueMatch').focus();};$('continueMatch').onclick=()=>$('surrenderDialog').close();$('confirmSurrender').onclick=()=>{$('surrenderDialog').close();choose(surrender);};
  $('overlay').classList.toggle('show',v.gameOver||!!current.aborted);$('resultTitle').hidden=!v.gameOver&&!current.aborted;$('result').textContent=v.gameOver?(v.outcome.draw?'引き分け':v.winner===v.viewer?'勝利':'敗北')+' / '+v.outcome.reason:v.surrenderPending?'投了要求を受け付けました。安全な処理境界で結果を確定します。':'';if(current.aborted&&!v.gameOver)$('result').textContent='勝敗なしで中止（復帰期限到達）。この端末で未受信の相手の確定結果は確認できません。';if((v.gameOver||current.aborted)&&$('surrenderDialog').open)$('surrenderDialog').close();
  renderInfo();drawPieces();
 }
 $('resultTitle').onclick=()=>{B3Poc.leave();sessionStorage.removeItem('cardTacticsStartInGame');location.href='../';};
 window.addEventListener('resize',drawPieces);window.addEventListener('orientationchange',()=>requestAnimationFrame(drawPieces));if(typeof ResizeObserver!=='undefined')new ResizeObserver(drawPieces).observe($('board'));
 globalThis.B3UI={render};
})();
