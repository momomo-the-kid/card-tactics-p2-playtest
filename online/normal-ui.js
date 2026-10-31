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
const CREATURE_ASSET_BASE="assets/creatures/";
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
globalThis.NormalGameUI=Object.freeze({clear(){current=null;},renderPieces,positionRoyalPedestals,cardHTML,rangeDiagram,rangePair,requestCreatureAsset});
})();
