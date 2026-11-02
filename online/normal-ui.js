'use strict';
// Shared CPU/online presentation. Ported from the pinned normal CPU screen.
// Consumes public/owner-view data and callbacks; never owns or executes game rules.
(()=>{
 const $=id=>document.getElementById(id);let current=null;
 const redraw=()=>{if(current){renderPieces(current);current.redrawInfo?.();}};
// One fixed projection draws and clips the same 25 native cell elements.
// Screen-space artwork follows their foot markers; there is no point-to-cell converter.
let presentationView='current',layoutFrame=0,previousLandscape=null;
const landscapeQuery=matchMedia('(orientation: landscape) and (min-width: 640px)');
function fixedProject(x,y,size,yaw){const a=yaw*Math.PI/180,t=55*Math.PI/180,u=(x*Math.cos(a)-y*Math.sin(a))*size,v=(x*Math.sin(a)+y*Math.cos(a))*size,w=1-v*Math.sin(t)/1000;return {x:u/w,y:v*Math.cos(t)/w};}
// Central-column ray meets the outer edge; the complete 64x36 royal target
// stays outside its supporting half-plane. This is presentation geometry only.
function royalAnchor(name,size,yaw){
 const y=name==='enemy'?-.5:.5,edge=fixedProject(0,y,size,yaw),a=fixedProject(-.1,y,size,yaw),b=fixedProject(.1,y,size,yaw),outside=fixedProject(0,y*1.2,size,yaw);
 let nx=-(b.y-a.y),ny=b.x-a.x;const len=Math.hypot(nx,ny);nx/=len;ny/=len;
 const dx=outside.x-edge.x,dy=outside.y-edge.y;if(nx*dx+ny*dy<0){nx=-nx;ny=-ny;}
 const distance=(32*Math.abs(nx)+18*Math.abs(ny)+3)/(nx*dx+ny*dy);
 return {x:edge.x+dx*distance,y:edge.y+dy*distance};
}
function projectCells(cells,wrap){
 const active=document.body.classList.contains('projected-board'),grid=wrap.querySelector('.boardGrid');
 if(!active){for(const c of cells){for(const key of ['position','left','top','width','height','clip-path'])c.style.removeProperty(key);delete c.dataset.logicalSize;}return;}
 const size=parseFloat(wrap.style.getPropertyValue('--logical-board')),ox=wrap.clientWidth/2+parseFloat(wrap.style.getPropertyValue('--plane-offset-x')),oy=wrap.clientHeight/2+parseFloat(wrap.style.getPropertyValue('--plane-offset-y')),yaw=presentationView==='left'?-28:0;
 const at=(x,y)=>{const p=fixedProject(x-.5,y-.5,size,yaw);return {x:p.x+ox,y:p.y+oy};};
 const point=(c,name,p,x,y)=>{const e=mark(c,name,0,0);e.style.left=(p.x-x)+'px';e.style.top=(p.y-y)+'px';};
 cells.forEach((c,i)=>{
  const row=Math.floor(i/5),col=i%5,coords=[[col/5,row/5],[(col+1)/5,row/5],[(col+1)/5,(row+1)/5],[col/5,(row+1)/5]],q=coords.map(([x,y])=>at(x,y));
  const x=Math.min(...q.map(p=>p.x)),y=Math.min(...q.map(p=>p.y)),w=Math.max(...q.map(p=>p.x))-x,h=Math.max(...q.map(p=>p.y))-y;
  Object.assign(c.style,{position:'absolute',left:x+'px',top:y+'px',width:w+'px',height:h+'px',clipPath:'polygon('+q.map(p=>(p.x-x)+'px '+(p.y-y)+'px').join(',')+')'});c.dataset.logicalSize=String(size/5);
  for(const [j,name]of ['nw','ne','se','sw'].entries())point(c,name,q[j],x,y);
  point(c,'foot',at((col+.5)/5,(row+.5)/5),x,y);point(c,'left',at(col/5,(row+.5)/5),x,y);point(c,'right',at((col+1)/5,(row+.5)/5),x,y);
 });
 for(const name of ['enemy','player']){const e=wrap.querySelector('.royalFoot.'+name),q=landscapeQuery.matches?royalAnchor(name,size,yaw):fixedProject(0,name==='enemy'?-.74:.74,size,yaw);e.style.left=(q.x+ox)+'px';e.style.top=(q.y+oy)+'px';}
 grid.setAttribute('viewBox','0 0 '+wrap.clientWidth+' '+wrap.clientHeight);grid.replaceChildren();
 const line=(axis,a,b)=>{const e=document.createElementNS('http://www.w3.org/2000/svg','path');e.dataset.gridAxis=axis;e.setAttribute('d','M'+a.x+' '+a.y+'L'+b.x+' '+b.y);grid.append(e);};
 for(let i=0;i<=5;i++){line('column',at(i/5,0),at(i/5,1));line('row',at(0,i/5),at(1,i/5));}
 refreshCellRings(cells,wrap,grid);
}

function refreshCellRings(cells,wrap,grid){grid.querySelectorAll('polygon,text').forEach(e=>e.remove());
 // These rings reflect existing presenter classes, never recalculate legal actions.
 for(const c of cells)if(c.classList.contains('cellEnchanted')&&!current?.board[Number(c.dataset.cell)]){const e=document.createElementNS('http://www.w3.org/2000/svg','text'),p=screenPoint(c.querySelector('[data-plane-point="foot"]'),wrap);e.setAttribute('x',p.x);e.setAttribute('y',p.y+4);e.setAttribute('text-anchor','middle');e.setAttribute('font-size','12');e.dataset.cellEffect=c.dataset.cell;e.textContent=c.classList.contains('ownMine')?'✹':'🔮';grid.append(e);}

 for(const c of cells){const colors=[['selected','#55a8ff'],['spellTarget','#ffad4e'],['cpuSelected','#ffd36b'],['cellEnchanted','#9b7cff']];for(const [name,color]of colors)if(c.classList.contains(name)){const e=document.createElementNS('http://www.w3.org/2000/svg','polygon');e.setAttribute('points',['nw','ne','se','sw'].map(name=>{const p=screenPoint(c.querySelector('[data-plane-point='+name+']'),wrap);return p.x+','+p.y;}).join(' '));e.setAttribute('fill','none');e.setAttribute('stroke',color);e.setAttribute('stroke-width','3');e.dataset.highlight=name;grid.append(e);}}
}
function syncLayout(){
 const landscape=landscapeQuery.matches;
 previousLandscape=landscape;
 const projected=landscape||presentationView==='left';
 document.body.classList.toggle('layout-landscape',landscape);
 document.body.classList.toggle('view-left',presentationView==='left');
 document.body.classList.toggle('projected-board',projected);
 const app=$('app'),column=document.querySelector('.boardColumn'),wrap=$('board')?.closest('.boardWrap');
 if(!app||!wrap)return;
 if(landscape){const viewport=visualViewport?.height||innerHeight,top=app.getBoundingClientRect().top+scrollY,safe=parseFloat(getComputedStyle(document.body).paddingBottom)||0;app.style.setProperty('--play-height',Math.max(340,Math.floor(viewport-top-safe-4))+'px');}else app.style.removeProperty('--play-height');
 const mana=column?.querySelector('.kingZone.player .manaStat')||app.querySelector('.manaDock .manaStat'),dock=app.querySelector('.manaDock'),zone=column?.querySelector('.kingZone.player');
 if(mana&&dock&&zone)(landscape?dock:zone).append(mana);
 const enemyZone=column?.querySelector(".kingZone.enemy"),enemyDock=app.querySelector(".enemyManaDock"),enemyMana=enemyZone?.querySelector(".manaStat")||enemyDock?.querySelector(".manaStat");
 if(enemyMana&&enemyDock&&enemyZone)(landscape?enemyDock:enemyZone).append(enemyMana);
 const message=$('message'),panel=$('infoPanel'),area=app.querySelector('.playArea');
 if(message&&panel&&area){if(landscape)panel.insertBefore(message,$('infoContent'));else app.insertBefore(message,area);}
 if(projected){
  // Fit both views to one shared envelope, including off-board royal bases/crowns.
  const portraitEnvelope=size=>{const pts=[];for(const yaw of [0,-28])for(const [x,y,king]of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[0,-.74,true],[0,.74,true]]){const p=fixedProject(x,y,size,yaw);pts.push([p.x-(king?40:0),p.y-(king?54:0)],[p.x+(king?40:0),p.y+(king?18:0)]);}return {x1:Math.min(...pts.map(p=>p[0])),x2:Math.max(...pts.map(p=>p[0])),y1:Math.min(...pts.map(p=>p[1])),y2:Math.max(...pts.map(p=>p[1]))};};
  const envelope=size=>{if(!landscapeQuery.matches)return portraitEnvelope(size);const pts=[];for(const yaw of [0,-28]){for(const [x,y]of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){const p=fixedProject(x,y,size,yaw);pts.push([p.x,p.y]);}for(const name of ['enemy','player']){const p=royalAnchor(name,size,yaw);pts.push([p.x-32,p.y-18],[p.x+32,p.y+18]);}}return {x1:Math.min(...pts.map(p=>p[0])),x2:Math.max(...pts.map(p=>p[0])),y1:Math.min(...pts.map(p=>p[1])),y2:Math.max(...pts.map(p=>p[1]))};};
  let lo=70,hi=800;for(let i=0;i<16;i++){const size=(lo+hi)/2,b=envelope(size);if(b.x2-b.x1<=wrap.clientWidth-8&&b.y2-b.y1<=wrap.clientHeight-8)lo=size;else hi=size;}
  const size=lo,b=envelope(size);wrap.style.setProperty('--logical-board',size+'px');wrap.style.setProperty('--plane-offset-x',(-(b.x1+b.x2)/2)+'px');wrap.style.setProperty('--plane-offset-y',(-(b.y1+b.y2)/2)+'px');
 }
}
function screenPoint(element,relative){const r=element.getBoundingClientRect(),o=relative.getBoundingClientRect();return {x:r.left-o.left,y:r.top-o.top};}
function mark(cell,name,x,y){let e=cell.querySelector('[data-plane-point="'+name+'"]');if(!e){e=document.createElement('span');e.className='planePoint';e.dataset.planePoint=name;e.setAttribute('aria-hidden','true');cell.append(e);}e.style.left=x+'%';e.style.top=y+'%';return e;}
function prepareCells(cells){cells.forEach((cell,i)=>{
 if(!cell.hasAttribute('data-cell'))cell.dataset.cell=String(i);
 mark(cell,'foot',50,50);mark(cell,'left',0,50);mark(cell,'right',100,50);
 for(const [name,x,y]of [['nw',0,0],['ne',100,0],['se',100,100],['sw',0,100]])mark(cell,name,x,y);
});}
function queuePresentation(){if(layoutFrame)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;syncLayout();if(current)renderPieces(current);});}
window.addEventListener('resize',queuePresentation);
window.addEventListener('orientationchange',queuePresentation);
landscapeQuery.addEventListener('change',queuePresentation);
window.visualViewport?.addEventListener('resize',queuePresentation);
function bindPresentation(){
 document.querySelectorAll('[data-scroll-hand]').forEach(b=>b.addEventListener('click',()=>{$('hand').scrollBy({left:Number(b.dataset.scrollHand)*Math.max(100,$('hand').clientWidth*.7),behavior:'instant'});}));
 const log=document.querySelector('.layoutLog');if(log){log.open=false;log.addEventListener('toggle',()=>{positionBattleLog();queueTutorialPresentation();});}
 const wrap=$('board')?.closest('.boardWrap');if(wrap&&typeof ResizeObserver!=='undefined')new ResizeObserver(queuePresentation).observe(wrap);
 syncLayout();
}
function startPlayPresentation(){const log=document.querySelector('.layoutLog');if(log)log.open=false;previousLogExplanation=false;tutorialExplanation=null;}
function positionBattleLog(){const log=document.querySelector('.layoutLog');if(!log?.open)return;const panel=log.querySelector('.logPanel'),summary=log.querySelector('summary'),r=summary.getBoundingClientRect();if(!panel)return;const anchorTop=landscapeQuery.matches?r.top:log.closest('.controls').getBoundingClientRect().top,width=Math.min(360,innerWidth-16);panel.style.width=width+'px';panel.style.left=Math.max(8,Math.min(r.right-width,innerWidth-width-8))+'px';const space=Math.max(64,Math.min(190,anchorTop-16));panel.style.maxHeight=space+'px';panel.style.setProperty('--log-space',space+'px');panel.style.top=Math.max(8,anchorTop-panel.offsetHeight-6)+'px';}
window.addEventListener('resize',positionBattleLog);window.visualViewport?.addEventListener('resize',positionBattleLog);window.addEventListener('scroll',positionBattleLog,{passive:true});
function tutorialSelectors(selectors){return selectors.map(selector=>{
 if(selector==='.kingZone.player .manaStat'&&landscapeQuery.matches)return '.manaDock .manaStat';
 return selector;
});}
let tutorialExplanation=null,tutorialPresentationFrame=0,previousLogExplanation=false;
function refreshTutorialGeometry(){
 const board=$('board'),wrap=board?.closest('.boardWrap');if(!wrap)return;
 let svg=wrap.querySelector('.tutorialGrid');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('tutorialGrid');svg.setAttribute('aria-hidden','true');wrap.append(svg);}
 svg.setAttribute('viewBox','0 0 '+wrap.clientWidth+' '+wrap.clientHeight);svg.replaceChildren();
 for(const cell of board.querySelectorAll('.cell.tutorialGlow')){const e=document.createElementNS('http://www.w3.org/2000/svg','polygon');e.dataset.tutorialCell=cell.dataset.cell;e.setAttribute('points',['nw','ne','se','sw'].map(name=>{const p=screenPoint(cell.querySelector('[data-plane-point='+name+']'),wrap);return p.x+','+p.y;}).join(' '));svg.append(e);}
}
function presentTutorial(explanation){
 tutorialExplanation=explanation;
 const log=explanation?.glow?.includes('#log')||false,details=$('log')?.closest('details');
 if(log!==previousLogExplanation&&details)details.open=log;previousLogExplanation=log;
 queueTutorialPresentation();
}
function queueTutorialPresentation(){if(tutorialPresentationFrame)return;tutorialPresentationFrame=requestAnimationFrame(()=>{tutorialPresentationFrame=0;positionBattleLog();positionTutorialExplanation();refreshTutorialGeometry();});}
function positionTutorialExplanation(){
 const coach=$('tutorialCoach');if(!coach||!document.body.classList.contains('tutorial-mode'))return;
 const step=tutorialExplanation;if(!step)return;
 const panel=$('infoPanel'),content=$('infoContent');let selectors=tutorialSelectors(step.glow||[]);
 if(step.action?.kind==='use')selectors=[...selectors,'#infoContent .useCardButton'];
 const targets=selectors.flatMap(s=>[...document.querySelectorAll(s)]),infoTarget=targets.find(e=>panel?.contains(e)),logTarget=targets.some(e=>e.id==='log');
 // Scroll only the internal detail scroller, never the page or the board.
 if(infoTarget&&content?.contains(infoTarget)){const a=infoTarget.getBoundingClientRect(),b=content.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)content.scrollTop+=a.top-b.top-4;}
 coach.classList.toggle('tutorialBesideInfo',!!infoTarget||logTarget);
 if(landscapeQuery.matches){const host=(infoTarget||logTarget)?document.querySelector('.boardColumn'):panel,r=host.getBoundingClientRect();coach.style.left=Math.max(4,r.left+6)+'px';coach.style.width=Math.max(logTarget?160:195,Math.min(infoTarget||logTarget?350:r.width-12,logTarget?Math.max(160,document.querySelector('.logPanel').getBoundingClientRect().left-r.left-18):r.width-12))+'px';coach.style.maxHeight=Math.max(100,r.height-12)+'px';coach.style.bottom='auto';coach.style.right='auto';coach.style.top=Math.max(4,r.bottom-coach.offsetHeight-6)+'px';}
 else if(logTarget){coach.style.transform='none';const r=document.querySelector('.logPanel').getBoundingClientRect();coach.style.width=Math.min(350,innerWidth-16)+'px';coach.style.left='8px';coach.style.right='auto';coach.style.bottom='auto';coach.style.maxHeight=Math.max(64,r.top-16)+'px';coach.style.overflowY='auto';coach.style.top=Math.max(8,r.top-coach.offsetHeight-8)+'px';}
 else{for(const k of ['left','top','width','max-height','bottom','right','overflow-y','transform'])coach.style.removeProperty(k);}
}
window.addEventListener('resize',queueTutorialPresentation);window.visualViewport?.addEventListener('resize',queueTutorialPresentation);window.addEventListener('scroll',queueTutorialPresentation,{passive:true});
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
 const wrap=$('board')?.closest('.boardWrap'), cells=$('board')?.querySelectorAll('.cell');
 if(!wrap||!cells||cells.length!==25)return;
 if(document.body.classList.contains('projected-board')){
  for(const [id,kind]of [['enemyPedestal','enemy'],['playerPedestal','player']]){
   const el=$(id),anchor=wrap.querySelector('.royalFoot.'+kind);if(!el||!anchor)continue;
   const point=screenPoint(anchor,wrap),width=landscapeQuery.matches?64:Math.max(64,Math.min(120,parseFloat(wrap.style.getPropertyValue('--logical-board'))*.30));
   el.style.left=point.x+'px';el.style.top=point.y+'px';el.style.width=width+'px';el.style.height=(landscapeQuery.matches?36:32)+'px';el.style.zIndex=String(100+Math.round(point.y));
  }return;
 }
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
 current=model;syncLayout();
 const overlay=$("pieceOverlay"), board=$("board");
 if(!overlay||!board)return;
 overlay.innerHTML="";
 prepareCells(board.querySelectorAll(".cell"));
 projectCells(board.querySelectorAll(".cell"),board.closest(".boardWrap"));
 positionRoyalPedestals();
 const wrapRect=overlay.getBoundingClientRect();
 const cells=board.querySelectorAll(".cell");
 cells.forEach((cell,k)=>{
  const index=Number(cell.dataset.cell??k),p=model.board[index];if(!p)return;
  const r=cell.getBoundingClientRect();
  const projected=document.body.classList.contains('projected-board');
  const foot=projected?screenPoint(cell.querySelector('[data-plane-point="foot"]'),overlay):{x:(r.left+r.right)/2-wrapRect.left,y:(r.top+r.bottom)/2-wrapRect.top};
  const x=foot.x,y=foot.y;
  const v=document.createElement("div");
  v.dataset.cell=String(index);v.className="overlayPiece "+(p.side===model.viewer?"player":"cpu");
  const enchantVisual=model.enchantVisual(p);
  if(enchantVisual)v.classList.add("hasCreatureEnchant");
  v.style.left=x+"px";v.style.top=y+"px";
  let width=Math.max(44,r.width*.92),height=Math.max(44,r.height*.98);
  if(projected){const a=screenPoint(cell.querySelector('[data-plane-point="left"]'),overlay),b=screenPoint(cell.querySelector('[data-plane-point="right"]'),overlay);width=Math.max(34,Math.min(82,Math.hypot(b.x-a.x,b.y-a.y)*.86));height=width;v.style.zIndex=String(100+Math.round(y));v.dataset.footX=x;v.dataset.footY=y;}
  v.style.setProperty('--piece-w',width+'px');v.style.setProperty('--piece-h',height+'px');
  const [lead,rest]=pieceNameParts(p.type);
  const esc=t=>String(t).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
   if(enchantVisual)v.style.setProperty("--creature-aura",enchantVisual.colors[0]||"#b985ff");
  v.innerHTML=`${model.rights(p).attack?'<span class="overlayDot attack"></span>':''}${model.rights(p).move?'<span class="overlayDot move"></span>':''}<div class="overlayNameLayer"><span class="overlayNameLead">${esc(lead)}</span><span class="overlayNameRest">${esc(rest)}</span></div>${enchantVisual?`<div class="creatureEnchantVisual"></div>`:""}<div class="overlayOrb"></div><img class="overlayCreatureAsset" alt="" aria-hidden="true"><div class="overlayStatsLayer"><span class="statIcon">❤️</span>${p.hp}<span class="statGap"></span><span class="statIcon">⚔️</span>${model.power(index,p)}</div>`;
  if(projected&&cell.classList.contains('cellEnchanted')){const badge=document.createElement('span');badge.className='planeCellStatus';badge.textContent=cell.classList.contains('ownMine')?'✹':'🔮';v.append(badge);}
  overlay.appendChild(v);
  const ring=v.querySelector('.creatureEnchantVisual');
  if(ring&&enchantVisual)ring.style.setProperty('--enchant-ring',enchantVisual.colors.length===1?enchantVisual.colors[0]:`conic-gradient(${enchantVisual.colors.join(',')})`);
  const assetImg=v.querySelector(".overlayCreatureAsset");
  if(assetImg)bindCreatureAsset(assetImg,v,p.type);
 });
 if(model.afterRender)model.afterRender();
 refreshTutorialGeometry();queueTutorialPresentation();
 if(document.body.classList.contains("projected-board"))refreshCellRings(cells,board.closest(".boardWrap"),board.closest(".boardWrap").querySelector(".boardGrid"));
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
 state:{view:'current',board:'rich',king:'default',creatureNames:true,...(includeCPU?{cpuDifficulty:'weak'}:{})},
 load(){try{const v=readStoredVisualSettings();if(['current','left'].includes(v.view))this.state.view=v.view;if(['light','antique','rich','simple'].includes(v.board))this.state.board=v.board;if(v.king==='pop')v.king='default';if(v.king==='simple')v.king='simple1';if(['default','dark','simple1','simple2','oldking','oldking2'].includes(v.king))this.state.king=v.king;if(typeof v.creatureNames==='boolean')this.state.creatureNames=v.creatureNames;if(includeCPU&&['weak','strong'].includes(v.cpuDifficulty))this.state.cpuDifficulty=v.cpuDifficulty}catch(e){}this.apply()},
 apply(){presentationView=this.state.view;document.body.classList.remove('board-light','board-antique','board-rich','board-simple','king-default','king-dark','king-simple1','king-simple2','king-oldking','king-oldking2','creature-names-off');document.body.classList.add('board-'+this.state.board,'king-'+this.state.king);if(!this.state.creatureNames)document.body.classList.add('creature-names-off');applyKingAsset(this.state.king);document.querySelectorAll('.settingsChoices[data-setting]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===this.state[g.dataset.setting])));document.querySelectorAll('#creatureNameChoices button').forEach(b=>b.classList.toggle('active',(b.dataset.nameVisible==='true')===this.state.creatureNames));try{localStorage.setItem('phase2VisualSettings',JSON.stringify({...readStoredVisualSettings(),...this.state}))}catch(e){}syncLayout();if(current)renderPieces(current);},
 set(key,value){if(!Object.hasOwn(this.state,key))return;if(key==='view'&&!['current','left'].includes(value))return;if(key==='king'&&!Object.hasOwn(KING_ASSET_PATHS,value))return;if(key==='board'&&!['light','antique','rich','simple'].includes(value))return;this.state[key]=value;this.apply()}
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
bindPresentation();VisualSettings.load();return VisualSettings;

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
globalThis.NormalGameUI=Object.freeze({startPlayPresentation,tutorialSelectors,refreshTutorialGeometry,presentTutorial,clear(){current=null;},renderPieces,positionRoyalPedestals,cardHTML,rangeDiagram,rangePair,requestCreatureAsset,createVisualSettings,renderTurn,bindHandScroll,attackStatus,creatureInfoHTML,graveyardHTML,globalEffectsHTML,globalDetailHTML,bindInfoScroll,hitBurst});
})();
