'use strict';
// Shared CPU/online presentation. Ported from the pinned normal CPU screen.
// Consumes public/owner-view data and callbacks; never owns or executes game rules.
(()=>{
 const $=id=>document.getElementById(id);let current=null;
 const redraw=()=>{if(current){renderPieces(current);current.redrawInfo?.();}};
function pieceNameParts(name){
 const glyphs=Array.from(String(name));
 return [glyphs[0]||"",glyphs.slice(1).join("")];
}
function pieceLabel(name){
 const [lead,rest]=pieceNameParts(name);
 const escapeHTML=t=>t.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 // A conservative cap ensures even long labels fit without affecting cell geometry.
 const restSize=Math.max(5,Math.min(12,Math.floor(38/Math.max(1,Array.from(rest).length))));
 return `<div class="pname"><span class="pnameLead">${escapeHTML(lead)}</span><span class="pnameRest" style="--rest-size:${restSize}px">${escapeHTML(rest)}</span></div>`;
}
function positionRoyalPedestals(){
 const wrap=$('board')?.parentElement, cells=$('board')?.querySelectorAll('.cell');
 if(!wrap||!cells||cells.length!==25)return;
 const wr=wrap.getBoundingClientRect();
 const specs=[['enemyPedestal',0,1,2,3,-1],['playerPedestal',20,21,22,23,1]];
 for(const [id,rowStart,colStart,colMid,colEnd,dir] of specs){
  const pedestal=$(id);if(!pedestal)continue;
  const first=cells[colStart].getBoundingClientRect(),last=cells[colEnd].getBoundingClientRect();
  const row=cells[rowStart].getBoundingClientRect();
  const width=Math.max(20,last.right-first.left);
  const depth=Math.max(15,row.height);
  const baseGap=Math.max(4,Math.min(8,depth*.09));
  const height=depth;
  const x=(first.left+last.right)/2-wr.left;
  // 手前側は従来の約半分の隙間。奥側は約30%広げ、
  // rotateXで台座が盤上へせり出して見える分も奥へ補正する。
  const gap=dir<0 ? (baseGap*1.30 + height*.10)*.85 : baseGap*.50;
  const y=dir<0?row.top-wr.top-gap-height:row.bottom-wr.top+gap;
  pedestal.style.left=x+'px';pedestal.style.top=y+'px';
  pedestal.style.width=width+'px';pedestal.style.height=height+'px';
  pedestal.style.borderRadius=Math.max(7,Math.min(20,height*.3))+'px';
 }
}
const CREATURE_ASSET_IDS={
 "歩兵":"infantry","銀級兵":"silver","金級兵":"gold","チャリオット":"chariot","アーチャー":"archer",
 "盗賊":"thief","サラマンダー":"salamander","踊り子":"dancer","戦狼":"war_wolf","ディアブロ":"diablo",
 "オルトロス":"orthros","隠密":"stealth","ソーサラー":"sorcerer","守備兵":"guard","バリケード":"barricade","暗殺者":"assassin"
};
const assetURL=name=>new URL((document.body.dataset.assetsBase||"assets/")+name,document.baseURI).href;
const CREATURE_ASSET_BASE=assetURL("creature/");
const creatureAssetCache=new Map();
function creatureAssetId(type){return CREATURE_ASSET_IDS[type]||null}
function creatureAssetPath(type){const id=creatureAssetId(type);return id?CREATURE_ASSET_BASE+id+".png":null}
function requestCreatureAsset(type){
  const path=creatureAssetPath(type);
  if(!path)return null;
  let entry=creatureAssetCache.get(path);
  if(entry)return entry;
  const image=new Image();
  entry={status:"loading",path,image};
  creatureAssetCache.set(path,entry);
  image.onload=()=>{entry.status="loaded";redraw()};
  image.onerror=()=>{entry.status="missing";redraw()};
  image.src=path;
  return entry;
}
function bindCreatureAsset(img,pieceEl,type){
  const entry=requestCreatureAsset(type);
  if(!entry||entry.status==="missing"){img.remove();return}
  if(entry.status==="loaded"){
    img.src=entry.image.src;
    pieceEl.classList.add("hasCreatureAsset");
    return;
  }
  img.remove();
}
function renderPieces(model){
 current=model;
 const overlay=$("pieceOverlay"), board=$("board");
 if(!overlay||!board)return;
 overlay.innerHTML="";
 positionRoyalPedestals();
 const wrapRect=overlay.getBoundingClientRect();
 const cells=board.querySelectorAll(".cell");
 cells.forEach((cell,k)=>{
  const index=Number(cell.dataset.cell??k),p=model.board[index];if(!p)return;
  const r=cell.getBoundingClientRect();
  const x=(r.left+r.right)/2-wrapRect.left;
  const y=(r.top+r.bottom)/2-wrapRect.top;
  const v=document.createElement("div");
  v.dataset.cell=String(index);v.className="overlayPiece "+(p.side===model.viewer?"player":"cpu");
  const enchantVisual=model.enchantVisual(p);
  if(enchantVisual)v.classList.add("hasCreatureEnchant");
  v.style.left=x+"px";v.style.top=y+"px";
  v.style.setProperty("--piece-w",Math.max(44,r.width*.92)+"px");
  v.style.setProperty("--piece-h",Math.max(44,r.height*.98)+"px");
  const [lead,rest]=pieceNameParts(p.type);
  const esc=t=>String(t).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
   if(enchantVisual)v.style.setProperty("--creature-aura",enchantVisual.colors[0]||"#b985ff");
  v.innerHTML=`${model.rights(p).attack?'<span class="overlayDot attack"></span>':''}${model.rights(p).move?'<span class="overlayDot move"></span>':''}<div class="overlayNameLayer"><span class="overlayNameLead">${esc(lead)}</span><span class="overlayNameRest">${esc(rest)}</span></div>${enchantVisual?`<div class="creatureEnchantVisual"></div>`:""}<div class="overlayOrb"></div><img class="overlayCreatureAsset" alt="" aria-hidden="true"><div class="overlayStatsLayer"><span class="statIcon">❤️</span>${p.hp}<span class="statGap"></span><span class="statIcon">⚔️</span>${model.power(index,p)}</div>`;
  overlay.appendChild(v);
  const ring=v.querySelector('.creatureEnchantVisual');
  if(ring&&enchantVisual)ring.style.setProperty('--enchant-ring',enchantVisual.colors.length===1?enchantVisual.colors[0]:`conic-gradient(${enchantVisual.colors.join(',')})`);
  const assetImg=v.querySelector(".overlayCreatureAsset");
  if(assetImg)bindCreatureAsset(assetImg,v,p.type);
 });
 if(model.afterRender)model.afterRender();
}
const RANGE_ARROWS={'-1,-1':'↖','-1,0':'↑','-1,1':'↗','0,-1':'←','0,1':'→','1,-1':'↙','1,0':'↓','1,1':'↘',
 '-2,-2':'↖','-2,0':'↑','-2,2':'↗','0,-2':'←','0,2':'→','2,-2':'↙','2,0':'↓','2,2':'↘'};
function rangeDiagram(p,action,pattern){
 const offsets=pattern(p,action), active=new Map(), through=new Set();
 for(const [dr,dc] of offsets){
  active.set(`${dr},${dc}`,RANGE_ARROWS[`${dr},${dc}`]||'●');
  const steps=Math.max(Math.abs(dr),Math.abs(dc));
  if(steps>1){for(let i=1;i<steps;i++){
   const r=dr*i/steps,c=dc*i/steps;
   if(Number.isInteger(r)&&Number.isInteger(c))through.add(`${r},${c}`);
  }}
 }
 const title=action==='move'?'移動範囲':'攻撃範囲';
 const kind=action==='move'?'movement':'attack';
 let cells='';
 for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++){
  const key=`${r},${c}`;
  const origin=r===0&&c===0;
  const arrow=active.get(key);
  const pass=!arrow&&through.has(key);
  cells+=`<span class="rangeCell ${origin?'origin':arrow?'arrow':pass?'pass':''}">${origin?'◯':arrow|| (pass?'・':'')}</span>`;
 }
 return `<div class="rangeSection"><div class="rangeTitle">${title}</div><div class="rangeGrid ${kind}" role="img" aria-label="${title}：前方が上。◯がクリーチャー。">${cells}</div>`+
  (action==='attack'&&offsets.some(([dr,dc])=>Math.max(Math.abs(dr),Math.abs(dc))>1)?'<div class="rangeNote">・は射程途中のマス（攻撃対象外）</div>':'')+'</div>';
}
function rangePair(p,pattern){return `<div class="rangePair">${rangeDiagram(p,'move',pattern)}${rangeDiagram(p,'attack',pattern)}</div>`;}

function cardHTML(t,d,{spell,enchant,text}){return enchant?`<div class="name">${t==="封魔"?"🔒":t==="王の覚醒"?"👑":t==="防御結界"?"🛡️":"💢"} ${t}</div><div class="cost">エンチャント / コスト ${d.cost}</div><div class="desc">${text}</div>`:spell?`<div class="name">${t==="ファイヤーボルト"?"🔥":t==="ホープ"?"✨":t==="転移魔法"?"🌀":t==="解呪"?"✨":t==="裏切り"?"↩️":t==="圧殺"?"💥":"💧"} ${t}</div><div class="cost">スペル / コスト ${d.cost}</div><div class="desc">${t==="ファイヤーボルト"?"対象に2ダメージ":t==="ホープ"?"対象のプレイヤーが2枚引く":t==="転移魔法"?"敵味方の駒を空きマスへ転移":t==="解呪"?"公開エンチャント・一時効果を解除（盤面全体も対象）":t==="裏切り"?"敵味方の駒の支配権を反転":t==="圧殺"?"自軍10体以上なら相手王のHPを0に":"自分の最大・未使用マナ+1（上限10）"}</div>`:`<div class="name">${t}</div><div class="cost">コスト ${d.cost}</div><div class="desc">ATK ${d.atk} / HP ${d.hp}${d.abilities?.length?`<br>${text}`:""}</div>`;}
function createVisualSettings({includeCPU=true}={}){
const KING_ASSET_PATHS={
 default:assetURL('kings/default.png'),
 dark:assetURL('kings/dark.png'),
 simple1:assetURL('kings/simple1.png'),
 simple2:assetURL('kings/simple2.png'),
 oldking:assetURL('kings/oldking.png'),
 oldking2:assetURL('kings/oldking2.png')
};
let kingAssetRequestId=0;
function loadImageAsset(src){return new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=src;});}
async function applyKingAsset(kind){
 const requestId=++kingAssetRequestId;
 const requested=KING_ASSET_PATHS[kind]||KING_ASSET_PATHS.default;
 let src=requested;
 let ok=await loadImageAsset(src);
 if(!ok && src!==KING_ASSET_PATHS.default){src=KING_ASSET_PATHS.default;ok=await loadImageAsset(src);}
 if(requestId!==kingAssetRequestId)return;
 if(ok){
   document.documentElement.style.setProperty('--king-image',`url("${src}")`);
   document.body.classList.add('king-external-loaded');
 }else{
   document.documentElement.style.removeProperty('--king-image');
   document.body.classList.remove('king-external-loaded');
 }
}
function readStoredVisualSettings(){try{const v=JSON.parse(localStorage.getItem('phase2VisualSettings')||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(e){return {};}}
const VisualSettings={
 state:{board:'rich',king:'default',creatureNames:true,...(includeCPU?{cpuDifficulty:'weak'}:{})},
 load(){try{const v=readStoredVisualSettings();if(['light','antique','rich','simple'].includes(v.board))this.state.board=v.board;if(v.king==='pop')v.king='default';if(v.king==='simple')v.king='simple1';if(['default','dark','simple1','simple2','oldking','oldking2'].includes(v.king))this.state.king=v.king;if(typeof v.creatureNames==='boolean')this.state.creatureNames=v.creatureNames;if(includeCPU&&['weak','strong'].includes(v.cpuDifficulty))this.state.cpuDifficulty=v.cpuDifficulty}catch(e){}this.apply()},
 apply(){document.body.classList.remove('board-light','board-antique','board-rich','board-simple','king-default','king-dark','king-simple1','king-simple2','king-oldking','king-oldking2','creature-names-off');document.body.classList.add('board-'+this.state.board,'king-'+this.state.king);if(!this.state.creatureNames)document.body.classList.add('creature-names-off');applyKingAsset(this.state.king);document.querySelectorAll('.settingsChoices[data-setting]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===this.state[g.dataset.setting])));document.querySelectorAll('#creatureNameChoices button').forEach(b=>b.classList.toggle('active',(b.dataset.nameVisible==='true')===this.state.creatureNames));try{localStorage.setItem('phase2VisualSettings',JSON.stringify({...readStoredVisualSettings(),...this.state}))}catch(e){}},
 set(key,value){if(!Object.hasOwn(this.state,key))return;if(key==='king'&&!Object.hasOwn(KING_ASSET_PATHS,value))return;if(key==='board'&&!['light','antique','rich','simple'].includes(value))return;this.state[key]=value;this.apply()}
};
function openSettings(){document.getElementById('settingsOverlay').classList.add('show');document.getElementById('settingsOverlay').setAttribute('aria-hidden','false')}
function closeSettings(){document.getElementById('settingsOverlay').classList.remove('show');document.getElementById('settingsOverlay').setAttribute('aria-hidden','true')}
document.getElementById('settingsButton').addEventListener('click',openSettings);
document.getElementById('settingsClose').addEventListener('click',closeSettings);
document.getElementById('settingsOverlay').addEventListener('click',e=>{if(e.target.id==='settingsOverlay')closeSettings()});
document.querySelectorAll('.settingsChoices[data-setting]').forEach(g=>g.addEventListener('click',e=>{const b=e.target.closest('button[data-value]');if(b)VisualSettings.set(g.dataset.setting,b.dataset.value)}));
document.getElementById('creatureNameChoices').addEventListener('click',e=>{const b=e.target.closest('button[data-name-visible]');if(b)VisualSettings.set('creatureNames',b.dataset.nameVisible==='true')});
const bgm=globalThis.CardTacticsBGM;
if(bgm){
 document.querySelectorAll('[data-bgm-enabled]').forEach(b=>b.addEventListener('click',()=>bgm.setEnabled(b.dataset.bgmEnabled==='true')));
 const slider=$('bgmVolume');
 slider.addEventListener('input',()=>bgm.setVolume(Number(slider.value)));
 bgm.subscribe(({enabled,volume,status})=>{
  document.querySelectorAll('[data-bgm-enabled]').forEach(b=>{const on=(b.dataset.bgmEnabled==='true')===enabled;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  slider.value=String(volume);$('bgmVolumeValue').value=volume+'％';slider.setAttribute('aria-valuetext',volume+'％');
  $('bgmStatus').textContent=status==='unavailable'?'音源を読み込めません。設定は保存されています。':status==='blocked'?'再生を開始できませんでした。画面を操作すると再試行します。':'対戦中にループ再生します。音量0％は無音です。';
 });
}
VisualSettings.load();return VisualSettings;

}
function renderTurn({activeSide,viewer,paused=false,ended=false}){
 const e=$('turnIndicator');if(!e)return;e.hidden=paused||ended;
 const own=activeSide===viewer;e.textContent=own?'あなたのターン中':'相手ターン中';
 e.classList.toggle('ownTurn',own);e.classList.toggle('enemyTurn',!own);
}
function bindHandScroll(){
 const hand=$('hand'),left=$('handScrollLeft'),right=$('handScrollRight');if(!hand||!left||!right)return ()=>{};
 const update=()=>{left.disabled=hand.scrollLeft<=3;right.disabled=hand.scrollLeft+hand.clientWidth>=hand.scrollWidth-3;};
 const scroll=direction=>{hand.scrollBy({left:direction*Math.max(100,hand.clientWidth*.75),behavior:'instant'});update();};
 left.onclick=()=>scroll(-1);right.onclick=()=>scroll(1);hand.addEventListener('scroll',update,{passive:true});
 window.addEventListener('resize',update);if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(hand);
 return update;
}
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const infoLine=x=>`<div class="infoLine">${escape(x)}</div>`;
 function attackStatus(piece,limit){const remaining=Math.max(0,limit-(piece.attacksUsed??(piece.a?limit:0)));return limit>1?(remaining?`攻撃 残${remaining}`:'攻撃 済'):(remaining?'攻撃 可':'攻撃 済');}
 function creatureInfoHTML({piece:p,viewer,definition:d,power:current,limit,range,abilityHTML='',description='',berserkDescription='基本攻撃力2倍、移動・攻撃は前方1マスのみ。',cellEffects=[]}){
  return `<div class="infoName creatureInfoName">${escape(p.type)}</div><div class="creatureBasics">`+infoLine(`${p.side===viewer?'自軍':'敵軍'} / コスト ${d.cost}`)+infoLine(`HP ${p.hp} / ${d.hp}　ATK ${current.total}（基本 ${current.base}${current.dancer?` / 踊り子 +${current.dancer}`:''}${current.pack?` / 味方 +${current.pack}`:''}）`)+infoLine(`🔵 移動 ${p.m?'済':'可'} / 🔴 ${attackStatus(p,limit)}`)+range+'</div>'+abilityHTML+(d.abilities?.length?`<div class="infoEffect">${escape(description)}</div>`:'')+(p.berserk>0?`<div class="infoEffect">バーサーク：残り${p.berserk}ターン<br>${escape(berserkDescription)}</div>`:'')+(current.battle?`<div class="infoEffect">決戦：${current.battleTurns.map(t=>t+'T').join('・')} / ATK +${current.battle}</div>`:'')+cellEffects.map(e=>`<div class="infoEffect">このマス：${escape(e.cardId)} 残り${e.remainingTurns}ターン<br>${escape(e.description||'')}</div>`).join('');
 }
 function graveyardHTML(cards,label){const counts=new Map();for(const c of cards)counts.set(c.cardId,(counts.get(c.cardId)||0)+1);return `<div class="infoName">${escape(label)}の墓地 🪦${cards.length}</div>`+(cards.length?[...counts].map(([id,n])=>infoLine(`${id} ×${n}`)).join(''):infoLine('墓地は空です。'))+infoLine('カードは元の持ち主の墓地に入ります。');}
 function globalEffectsHTML(cards){return `<div class="infoName">全体エンチャント 🔮${cards.length}</div>`+(cards.length?cards.map(c=>`<button type="button" class="globalEnchantButton" data-effect-detail="${escape(c.instanceId)}">《${escape(c.cardId)}》${c.remainingTurns!=null?`　残り${c.remainingTurns}ターン`:''}</button>`).join(''):infoLine('効果中の全体エンチャントはありません。'));}
 function globalDetailHTML(card,definition,description){return card?`<div class="infoName">${escape(card.cardId)}</div>`+infoLine(`全体エンチャント / コスト ${definition?.cost??'-'}`)+(card.remainingTurns!=null?infoLine(`残り ${card.remainingTurns}ターン`):'')+`<div class="infoEffect">${escape(description||'')}</div><button type="button" class="useCardButton" data-effects-back>一覧に戻る</button>`:`<div class="infoName">全体エンチャント</div>`+infoLine('このエンチャントの効果は終了しました。');}
 function bindInfoScroll(){const panel=$('infoContent'),up=$('infoScrollUp'),down=$('infoScrollDown');if(!panel||!up||!down)return ()=>{};const update=()=>{const r=panel.getBoundingClientRect(),can=panel.scrollHeight>panel.clientHeight+3;for(const [el,on,y]of [[up,can&&panel.scrollTop>3,r.top+4],[down,can&&panel.scrollTop+panel.clientHeight<panel.scrollHeight-3,r.bottom-20]]){el.classList.toggle('show',on);el.style.left=(r.left+r.width/2-8)+'px';el.style.top=y+'px';}};panel.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(panel);return update;}
 function hitBurst(element,{id,remaining=710}={}){if(!element||matchMedia('(prefers-reduced-motion: reduce)').matches)return;element.querySelectorAll('.sharedHitBurst').forEach(n=>n.remove());const burst=document.createElement('span');burst.className='sharedHitBurst';burst.textContent='✴️';burst.dataset.hitFx=String(id);burst.style.animationDuration=Math.max(80,remaining)+'ms';element.append(burst);return burst;}
globalThis.NormalGameUI=Object.freeze({clear(){current=null;},renderPieces,positionRoyalPedestals,cardHTML,rangeDiagram,rangePair,requestCreatureAsset,createVisualSettings,renderTurn,bindHandScroll,attackStatus,creatureInfoHTML,graveyardHTML,globalEffectsHTML,globalDetailHTML,bindInfoScroll,hitBurst});
})();
