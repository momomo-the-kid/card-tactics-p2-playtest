'use strict';
// Shared CPU/online presentation. Ported from the pinned normal CPU screen.
// Consumes public/owner-view data and callbacks; never owns or executes game rules.
(()=>{
 const $=id=>document.getElementById(id);let current=null;
 // Rebuild detail first so the final piece pass decorates current tutorial targets.
 const redraw=()=>{if(current){current.redrawInfo?.();renderPieces(current);}};
// One fixed projection draws and clips the same 25 native cell elements.
// Screen-space artwork follows their foot markers; there is no point-to-cell converter.
let presentationView='current',layoutFrame=0;
const landscapeQuery=matchMedia('(orientation: landscape) and (min-width: 640px)');
function fixedProject(x,y,size,yaw){const a=yaw*Math.PI/180,t=55*Math.PI/180,u=(x*Math.cos(a)-y*Math.sin(a))*size,v=(x*Math.sin(a)+y*Math.cos(a))*size,w=1-v*Math.sin(t)/1000;return {x:u/w,y:v*Math.cos(t)/w};}
// Central-column ray meets the outer edge; the complete 64x36 royal target
// stays outside its supporting half-plane. This is presentation geometry only.
function hpOnLeft(name){return !landscapeQuery.matches&&presentationView==='left'?name==='player':name==='enemy';}
function royalAnchor(name,size,yaw){
 const y=name==='enemy'?-.5:.5,edge=fixedProject(0,y,size,yaw),a=fixedProject(-.1,y,size,yaw),b=fixedProject(.1,y,size,yaw),outside=fixedProject(0,y*1.2,size,yaw);
 let nx=-(b.y-a.y),ny=b.x-a.x;const len=Math.hypot(nx,ny);nx/=len;ny/=len;
 const dx=outside.x-edge.x,dy=outside.y-edge.y;if(nx*dx+ny*dy<0){nx=-nx;ny=-ny;}
 const [x1,y1,x2,y2]=royalBounds(name),distance=(Math.max(...[[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(([x,y])=>-nx*x-ny*y))+3)/(nx*dx+ny*dy);
 return {x:edge.x+dx*distance,y:edge.y+dy*distance};
}
function royalBounds(name){return !landscapeQuery.matches?[-32,-18,32,18]:name==='enemy'?[-118,-18,32,18]:[-32,-18,118,18];}
const layoutHomes=new WeakMap();
function moveLayoutNode(node,parent){if(!node||!parent)return;if(!layoutHomes.has(node)){const home=document.createComment('presentation home');node.before(home);layoutHomes.set(node,home);}if(node.parentNode!==parent)parent.append(node);}
function restoreLayoutNode(node){const home=node&&layoutHomes.get(node);if(home?.parentNode&&node.previousSibling!==home)home.after(node);}
function arrangeLandscapeInfo(landscape,app,column,wrap){
 let leftDock=column.querySelector('.enemyInfoDock');if(!leftDock){leftDock=document.createElement('div');leftDock.className='enemyInfoDock';column.append(leftDock);}
 let dock=column.querySelector('.battleInfoDock');if(!dock){dock=document.createElement('div');dock.className='battleInfoDock';column.append(dock);}
 const turn=$('turnIndicator'),enemyDock=app.querySelector('.enemyManaDock'),effects=app.querySelector('.status .statusButton')||dock.querySelector('.statusButton');
 for(const node of [turn,effects]){if(landscape)moveLayoutNode(node,dock);else restoreLayoutNode(node);}
 if(landscape)moveLayoutNode(enemyDock,leftDock);else restoreLayoutNode(enemyDock);
 for(const kind of ['enemy','player']){let group=wrap.querySelector('.royalGrave.'+kind);if(!group){group=document.createElement('span');group.className='royalGrave '+kind;group.setAttribute('aria-label',kind==='enemy'?'相手の墓地':'自分の墓地');wrap.append(group);}const button=column.querySelector('.kingZone.'+kind+' .graveButton')||group.querySelector('.graveButton');if(landscape)moveLayoutNode(button,group);else restoreLayoutNode(button);}
 return dock;
}
// Reparent the same live nodes; preserve listeners, selections and scroll position.
function arrangeBattleStrip(active,app){
 const strip=app.querySelector('.battleStrip');if(!strip)return;
 const hand=app.querySelector('.handScroller'),scroll=$('hand')?.scrollLeft||0;
 const nodes=[[app.querySelector('.layoutLog'),strip.querySelector('.stripLeft')],[app.querySelector('.manaDock'),strip.querySelector('.stripLeft')],[hand,strip]];
 for(const id of ['undoOne','surrenderGame','onlineUndo','onlineSurrender'])nodes.push([$(id),strip.querySelector('.stripButtons')]);
 nodes.push([$('endTurn'),strip.querySelector('.stripEnd')]);
 for(const [node,parent]of nodes)if(active)moveLayoutNode(node,parent);else restoreLayoutNode(node);
 if($('hand'))$('hand').scrollLeft=scroll;
}
let noticeScope=null;
function setNotice(text,scope){const message=$('message');if(message){message.textContent=text;noticeScope=scope;}}
function renderSelectionStatus({operation='',guide='',choice='',paused='',scope=''}){
 const label=$('selectionContext'),message=$('message');if(!label)return;
 const viewing=$('infoContent')?.querySelector('.infoName')?.textContent||'';
 const live=choice?'必須選択：'+choice:paused?paused:operation?'操作対象：'+operation+(guide?' — '+guide:''):'対象を選択してください。';
 label.textContent=live+(viewing&&(!operation||!viewing.startsWith(operation))?' ／ 閲覧：'+viewing:'');
 label.dataset.operation=operation;label.dataset.viewing=viewing;
 if(message&&noticeScope!==scope){message.textContent='';noticeScope=null;}
}
function restoreNativePlane(board,wrap){
 // Release all presentation-owned projection state before any geometry reads.
 for(const cell of board.querySelectorAll('.cell')){for(const key of ['position','left','top','width','height','clip-path'])cell.style.removeProperty(key);delete cell.dataset.logicalSize;}
 for(const key of ['--logical-board','--plane-offset-x','--plane-offset-y'])wrap.style.removeProperty(key);
 wrap.querySelector('.boardGrid')?.replaceChildren();
 for(const foot of wrap.querySelectorAll('.royalFoot')){foot.style.removeProperty('left');foot.style.removeProperty('top');}
}
function projectionShapes(size,yaw){
 const board=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>fixedProject(x,y,size,yaw));
 const shapes=[board];for(const kind of ['enemy','player']){const p=royalAnchor(kind,size,yaw),[a,b,c,d]=royalBounds(kind);shapes.push([[a,b],[c,b],[c,d],[a,d]].map(([x,y])=>({x:p.x+x,y:p.y+y})));}return shapes;
}
function shapeBounds(shapes){const points=shapes.flat();return {x1:Math.min(...points.map(p=>p.x)),x2:Math.max(...points.map(p=>p.x)),y1:Math.min(...points.map(p=>p.y)),y2:Math.max(...points.map(p=>p.y))};}
function intersectsRect(poly,r){
 if(poly.every(p=>p.x<=r.x1)||poly.every(p=>p.x>=r.x2)||poly.every(p=>p.y<=r.y1)||poly.every(p=>p.y>=r.y2))return false;
 const box=[{x:r.x1,y:r.y1},{x:r.x2,y:r.y1},{x:r.x2,y:r.y2},{x:r.x1,y:r.y2}];
 for(const axis of [{x:1,y:0},{x:0,y:1},...poly.map((p,i)=>{const q=poly[(i+1)%poly.length];return {x:p.y-q.y,y:q.x-p.x};})]){const a=poly.map(p=>p.x*axis.x+p.y*axis.y),b=box.map(p=>p.x*axis.x+p.y*axis.y);if(Math.max(...a)<=Math.min(...b)||Math.max(...b)<=Math.min(...a))return false;}return true;
}
function projectedPieceWidth(a,b){return Math.max(34,Math.min(82,Math.hypot(b.x-a.x,b.y-a.y)*.86));}
function overlayProtection(size,yaw){
 const board=projectionShapes(size,yaw)[0],bounds=shapeBounds([board]),compact=Math.min(bounds.x2-bounds.x1,bounds.y2-bounds.y1)/5<64;
 const rect=(x1,y1,x2,y2)=>[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}],out=[];
 for(let row=0;row<5;row++)for(let col=0;col<5;col++){
  const y=(row+.5)/5-.5,foot=fixedProject((col+.5)/5-.5,y,size,yaw),width=projectedPieceWidth(fixedProject(col/5-.5,y,size,yaw),fixedProject((col+1)/5-.5,y,size,yaw)),scale=yaw?1.5:1;
  const bottom=foot.y+width*.31,artHeight=width*.68*scale,artWidth=width*.88*scale;
  out.push(rect(foot.x-artWidth/2,bottom-artHeight,foot.x+artWidth/2,bottom));
  const nameWidth=compact?38:76,nameTop=foot.y+(compact?-25:-52);out.push(rect(foot.x-nameWidth/2,nameTop,foot.x+nameWidth/2,nameTop+(compact?9:13)));
  const statWidth=compact?40:64;out.push(rect(foot.x-statWidth/2,foot.y+(compact?-5:0),foot.x+statWidth/2,foot.y+(compact?21:36)));
 }return out;
}
function fitProjection(wrap,dock){
 const landscape=landscapeQuery.matches,yaw=presentationView==='left'?-45:0,w=wrap.clientWidth,h=wrap.clientHeight;
 if(!w||!h)return;
 const wr=wrap.getBoundingClientRect(),obstacles=landscape?[dock,wrap.closest('.boardColumn').querySelector('.enemyInfoDock'),...document.querySelectorAll('.gameTopBar>button,.appHeader>button')].filter(Boolean).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({x1:r.left-wr.left-4,y1:r.top-wr.top-4,x2:r.right-wr.left+4,y2:r.bottom-wr.top+4})):[];
 const place=size=>{const shapes=projectionShapes(size,yaw),protection=[...shapes,...overlayProtection(size,yaw)],b=shapeBounds(shapes),x1=4-b.x1,x2=w-4-b.x2,y1=4-b.y1,y2=h-4-b.y2;if(x2<x1||y2<y1)return null;
  const cx=(w-b.x1-b.x2)/2,cy=(h-b.y1-b.y2)/2,positions=[];
  // A small screen-space fit search, not a camera control or input converter.
  for(const fx of [.5,0,.25,.75,1])for(const fy of [.5,0,.25,.75,1]){const x=x1+(x2-x1)*fx,y=y1+(y2-y1)*fy;if(obstacles.some(obstacle=>protection.some(poly=>intersectsRect(poly.map(p=>({x:p.x+x,y:p.y+y})),obstacle))))continue;positions.push({x,y,score:(x-cx)**2+(y-cy)**2});}
  positions.sort((a,b)=>a.score-b.score);return positions[0]||null;
 };
 // Portrait B retains v6's shared A/B scale and existing status clearance.
 if(!landscape){const envelope=size=>shapeBounds([0,-45].flatMap(a=>projectionShapes(size,a)));let lo=70,hi=800;for(let i=0;i<16;i++){const n=(lo+hi)/2,b=envelope(n);if(b.x2-b.x1<=w-8&&b.y2-b.y1<=h-8)lo=n;else hi=n;}const b=envelope(lo),active=shapeBounds(projectionShapes(lo,yaw));let y=(h-b.y1-b.y2)/2;const status=[...document.querySelectorAll('.kingZone.enemy .manaStat,.kingZone.enemy .graveButton')].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height),top=Math.max(0,...status.map(r=>r.bottom-wr.top+4));y+=Math.min(Math.max(0,top-y-active.y1),Math.max(0,h-4-y-active.y2));wrap.style.setProperty('--logical-board',lo+'px');wrap.style.setProperty('--plane-offset-x',(-(b.x1+b.x2)/2)+'px');wrap.style.setProperty('--plane-offset-y',(y-h/2)+'px');return;}
 let lo=30,hi=1000,best=place(lo);for(let i=0;i<17;i++){const n=(lo+hi)/2,p=place(n);if(p){lo=n;best=p;}else hi=n;}
 if(!best)return;wrap.style.setProperty('--logical-board',lo+'px');wrap.style.setProperty('--plane-offset-x',(best.x-w/2)+'px');wrap.style.setProperty('--plane-offset-y',(best.y-h/2)+'px');
}
function projectCells(cells,wrap){
 const active=document.body.classList.contains('projected-board'),grid=wrap.querySelector('.boardGrid');
 if(!active){for(const c of cells){for(const key of ['position','left','top','width','height','clip-path'])c.style.removeProperty(key);delete c.dataset.logicalSize;}return;}
 const size=parseFloat(wrap.style.getPropertyValue('--logical-board')),ox=wrap.clientWidth/2+parseFloat(wrap.style.getPropertyValue('--plane-offset-x')),oy=wrap.clientHeight/2+parseFloat(wrap.style.getPropertyValue('--plane-offset-y')),yaw=presentationView==='left'?-45:0;
 const at=(x,y)=>{const p=fixedProject(x-.5,y-.5,size,yaw);return {x:p.x+ox,y:p.y+oy};};
 const point=(c,name,p,x,y)=>{const e=mark(c,name,0,0);e.style.left=(p.x-x)+'px';e.style.top=(p.y-y)+'px';};
 cells.forEach((c,i)=>{
  const row=Math.floor(i/5),col=i%5,coords=[[col/5,row/5],[(col+1)/5,row/5],[(col+1)/5,(row+1)/5],[col/5,(row+1)/5]],q=coords.map(([x,y])=>at(x,y));
  const x=Math.min(...q.map(p=>p.x)),y=Math.min(...q.map(p=>p.y)),w=Math.max(...q.map(p=>p.x))-x,h=Math.max(...q.map(p=>p.y))-y;
  Object.assign(c.style,{position:'absolute',left:x+'px',top:y+'px',width:w+'px',height:h+'px',clipPath:'polygon('+q.map(p=>(p.x-x)+'px '+(p.y-y)+'px').join(',')+')'});c.dataset.logicalSize=String(size/5);
  for(const [j,name]of ['nw','ne','se','sw'].entries())point(c,name,q[j],x,y);
  point(c,'foot',at((col+.5)/5,(row+.5)/5),x,y);point(c,'left',at(col/5,(row+.5)/5),x,y);point(c,'right',at((col+1)/5,(row+.5)/5),x,y);
 });
 for(const name of ['enemy','player']){const e=wrap.querySelector('.royalFoot.'+name),q=royalAnchor(name,size,yaw);e.style.left=(q.x+ox)+'px';e.style.top=(q.y+oy)+'px';}
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
 const projected=landscape||presentationView==='left';
 document.body.classList.toggle('layout-landscape',landscape);
 document.body.classList.toggle('view-left',presentationView==='left');
 document.body.classList.toggle('projected-board',projected);
 const app=$('app'),column=document.querySelector('.boardColumn'),wrap=$('board')?.closest('.boardWrap');
 if(!app||!wrap)return;
 const board=$('board');if(!projected)restoreNativePlane(board,wrap);
 wrap.dataset.renderMode=projected?'projected':'native';
 const infoDock=arrangeLandscapeInfo(landscape,app,column,wrap);
 arrangeBattleStrip(landscape,app);
 if(landscape){const viewport=visualViewport?.height||innerHeight,top=app.getBoundingClientRect().top+scrollY,safe=parseFloat(getComputedStyle(document.body).paddingBottom)||0;app.style.setProperty('--play-height',Math.max(260,Math.floor(viewport-top-safe-4))+'px');}else app.style.removeProperty('--play-height');
 const mana=column?.querySelector('.kingZone.player .manaStat')||app.querySelector('.manaDock .manaStat'),dock=app.querySelector('.manaDock'),zone=column?.querySelector('.kingZone.player');
 if(mana&&dock&&zone)(landscape?dock:zone).append(mana);
 const enemyZone=column?.querySelector(".kingZone.enemy"),enemyDock=app.querySelector(".enemyManaDock"),enemyMana=enemyZone?.querySelector(".manaStat")||enemyDock?.querySelector(".manaStat");
 if(enemyMana&&enemyDock&&enemyZone)(landscape?enemyDock:enemyZone).append(enemyMana);
 const message=$('message'),panel=$('infoPanel'),area=app.querySelector('.playArea');
 if(message&&panel&&area){if(landscape)panel.append(message);else app.insertBefore(message,area);}
 if(projected)fitProjection(wrap,infoDock);
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
 bindHandScroll();
 const log=document.querySelector('.layoutLog');if(log){log.open=false;log.addEventListener('toggle',()=>{positionBattleLog();queueTutorialPresentation();});if(typeof ResizeObserver!=='undefined')new ResizeObserver(positionBattleLog).observe(log.querySelector('.logPanel'));}
 const wrap=$('board')?.closest('.boardWrap');if(wrap&&typeof ResizeObserver!=='undefined')new ResizeObserver(queuePresentation).observe(wrap);
 syncLayout();
}
function startPlayPresentation(){const log=document.querySelector('.layoutLog');if(log)log.open=false;previousLogExplanation=false;tutorialExplanation=null;}
function positionBattleLog(){
 const log=document.querySelector('.layoutLog'),panel=log?.querySelector('.logPanel');if(!panel)return;
 // Portrait is ordinary document flow. Never retain popup geometry, even closed.
 if(!landscapeQuery.matches||!log.open){for(const k of ['width','left','top','max-height','--log-space'])panel.style.removeProperty(k);return;}
 const r=log.querySelector('summary').getBoundingClientRect(),width=Math.min(360,innerWidth-16);panel.style.width=width+'px';panel.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';const space=Math.max(64,Math.min(190,r.top-16));panel.style.maxHeight=space+'px';panel.style.setProperty('--log-space',space+'px');panel.style.top=Math.max(8,r.top-panel.offsetHeight-6)+'px';
}
window.addEventListener('resize',positionBattleLog);window.visualViewport?.addEventListener('resize',positionBattleLog);window.addEventListener('scroll',positionBattleLog,{passive:true});
function tutorialSelectors(selectors){return selectors.map(selector=>{
 if(selector==='.kingZone.enemy .kingStat:not(.manaStat)')return '.royalHP.enemy';
 if(selector==='.kingZone.player .kingStat:not(.manaStat)')return '.royalHP.player';
 if(selector==='.kingZone.player .manaStat'&&landscapeQuery.matches)return '.manaDock .manaStat';
 if(selector==='.kingZone.enemy .manaStat'&&landscapeQuery.matches)return '.enemyInfoDock .manaStat';
 if(selector==='.kingZone.enemy .graveButton'&&landscapeQuery.matches)return '.royalGrave.enemy .graveButton';
 if(selector==='.kingZone.player .graveButton'&&landscapeQuery.matches)return '.royalGrave.player .graveButton';
 if(selector==='.status .statusButton'&&landscapeQuery.matches)return '.battleInfoDock .statusButton';
 return selector;
});}
let tutorialExplanation=null,tutorialPresentationFrame=0,previousLogExplanation=false,tutorialLogScrollPending=false;
function refreshTutorialGeometry(){
 const board=$('board'),wrap=board?.closest('.boardWrap');if(!wrap)return;
 let svg=wrap.querySelector('.tutorialGrid');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('tutorialGrid');svg.setAttribute('aria-hidden','true');wrap.append(svg);}
 svg.setAttribute('viewBox','0 0 '+wrap.clientWidth+' '+wrap.clientHeight);svg.replaceChildren();
 for(const cell of board.querySelectorAll('.cell.tutorialGlow')){const e=document.createElementNS('http://www.w3.org/2000/svg','polygon');e.dataset.tutorialCell=cell.dataset.cell;e.setAttribute('points',['nw','ne','se','sw'].map(name=>{const p=screenPoint(cell.querySelector('[data-plane-point='+name+']'),wrap);return p.x+','+p.y;}).join(' '));svg.append(e);}
}
function presentTutorial(explanation){
 tutorialExplanation=explanation;
 const log=explanation?.glow?.includes('#log')||false,details=$('log')?.closest('details');
 if(log!==previousLogExplanation&&details){details.open=log;if(log)tutorialLogScrollPending=true;}previousLogExplanation=log;
 queueTutorialPresentation();
}
function queueTutorialPresentation(){if(tutorialPresentationFrame)return;tutorialPresentationFrame=requestAnimationFrame(()=>{tutorialPresentationFrame=0;positionBattleLog();positionTutorialExplanation();refreshTutorialGeometry();});}
function positionTutorialExplanation(){
 const coach=$('tutorialCoach');if(!coach)return;if(!document.body.classList.contains('tutorial-mode')){restoreLayoutNode(coach);coach.classList.remove('tutorialAtLog');return;}
 const step=tutorialExplanation;if(!step)return;
 const panel=$('infoPanel'),content=$('infoContent');let selectors=tutorialSelectors(step.glow||[]);
 if(step.action?.kind==='use')selectors=[...selectors,'#infoContent .useCardButton'];
 const targets=selectors.flatMap(s=>[...document.querySelectorAll(s)]),infoTarget=targets.find(e=>panel?.contains(e)),logTarget=targets.some(e=>e.id==='log');
 // Scroll only the internal detail scroller, never the page or the board.
 if(infoTarget&&content?.contains(infoTarget)){const a=infoTarget.getBoundingClientRect(),b=content.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)content.scrollTop+=a.top-b.top-4;}
 coach.classList.toggle('tutorialBesideInfo',!!infoTarget||logTarget);
 const flowLog=logTarget&&!landscapeQuery.matches;
 if(flowLog){
  const details=$('log').closest('details');if(!coach.classList.contains('tutorialAtLog'))tutorialLogScrollPending=true;
  moveLayoutNode(coach,details.parentElement);details.before(coach);coach.classList.add('tutorialAtLog');
  for(const k of ['left','top','width','max-height','bottom','right','overflow-y','transform'])coach.style.removeProperty(k);
  if(tutorialLogScrollPending){tutorialLogScrollPending=false;coach.scrollIntoView({block:'start',behavior:'instant'});}return;
 }
 restoreLayoutNode(coach);coach.classList.remove('tutorialAtLog');
 if(landscapeQuery.matches&&logTarget){const r=document.querySelector('.boardColumn').getBoundingClientRect(),log=document.querySelector('.logPanel').getBoundingClientRect(),left=Math.max(r.left+6,log.right+8);coach.style.left=left+'px';coach.style.width=Math.max(160,r.right-left-6)+'px';coach.style.top=Math.max(r.top+4,r.bottom-coach.offsetHeight-6)+'px';coach.style.maxHeight=Math.max(100,r.height-12)+'px';coach.style.bottom='auto';coach.style.right='auto';return;}
 if(landscapeQuery.matches){const host=(infoTarget||logTarget)?document.querySelector('.boardColumn'):panel,r=host.getBoundingClientRect();coach.style.left=Math.max(4,r.left+6)+'px';coach.style.width=Math.max(logTarget?160:195,Math.min(infoTarget||logTarget?350:r.width-12,logTarget?Math.max(160,document.querySelector('.logPanel').getBoundingClientRect().left-r.left-18):r.width-12))+'px';coach.style.maxHeight=Math.max(100,r.height-12)+'px';coach.style.bottom='auto';coach.style.right='auto';coach.style.top=Math.max(4,r.bottom-coach.offsetHeight-6)+'px';}

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
 if(!wrap||!cells||cells.length!==25||!wrap.clientWidth||!wrap.clientHeight)return;
 for(const [kind,id]of [['enemy','enemyPedestal'],['player','playerPedestal']]){let hud=wrap.querySelector('.royalHP.'+kind);if(!hud){hud=document.createElement('span');hud.className='royalHP '+kind;hud.setAttribute('aria-label',kind==='enemy'?'相手の王HP':'自分の王HP');wrap.append(hud);}const stat=document.querySelector('.kingZone.'+kind+' .kingStat:not(.manaStat)');if(stat){stat.firstChild.textContent='❤️';hud.append(stat);}}
 if(document.body.classList.contains('projected-board')){
  for(const [id,kind]of [['enemyPedestal','enemy'],['playerPedestal','player']]){
   const el=$(id),anchor=wrap.querySelector('.royalFoot.'+kind);if(!el||!anchor)continue;
   const point=screenPoint(anchor,wrap),width=64;
   el.style.left=point.x+'px';el.style.top=point.y+'px';el.style.width=width+'px';el.style.height='36px';el.style.zIndex=String(100+Math.round(point.y));
  }positionRoyalHP(wrap);return;
 }
 const wr=wrap.getBoundingClientRect();
 // Portrait A keeps the existing CSS perspective. Use the real non-zero
 // central cell border boxes, not zero-area descendants inside preserve-3d.
 // In this direction the near/far edges are horizontal in screen space.
 for(const [id,index,dir] of [['enemyPedestal',2,-1],['playerPedestal',22,1]]){
  const pedestal=$(id);if(!pedestal)continue;
  const cell=cells[index].getBoundingClientRect();if(!cell.width||!cell.height)return;
  const x=(cell.left+cell.right)/2-wr.left,edge=dir<0?cell.top:cell.bottom;
  pedestal.style.left=x+'px';pedestal.style.top=(edge-wr.top+dir*28)+'px';
  pedestal.style.width='64px';pedestal.style.height='36px';
 }positionRoyalHP(wrap);
}
function positionRoyalHP(wrap){for(const [kind,id]of [['enemy','enemyPedestal'],['player','playerPedestal']]){const hud=wrap.querySelector('.royalHP.'+kind),b=$(id).getBoundingClientRect(),w=wrap.getBoundingClientRect();hud.style.left=(!landscapeQuery.matches?b.left-w.left+32:hpOnLeft(kind)?b.left-w.left-48:b.right-w.left+4)+'px';hud.style.top=(b.top-w.top+(!landscapeQuery.matches?4:(b.height-24)/2))+'px';const grave=wrap.querySelector('.royalGrave.'+kind);if(landscapeQuery.matches&&grave){grave.style.left=(kind==='enemy'?b.left-w.left-86:b.right-w.left+52)+'px';grave.style.top=(b.top-w.top+2)+'px';}}}

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
// These records describe public state; legal options still come exclusively from Core.
function creatureDisplay({piece,definition,power,pattern,rights,limit,used=piece.attacksUsed??(piece.a?limit:0)}){
 const patterns={move:pattern(piece,'move'),attack:pattern(piece,'attack')};
 const remaining=Math.max(0,limit-used);
 const reason=(piece.actionRestrictions||[]).some(e=>e.kind==='move-attack-prohibited')?'行動制約（移動・攻撃禁止）':'現在の行動制約';
 const action=kind=>{
  const range=patterns[kind];
  if(!range.length)return {kind,state:'none',label:kind==='attack'?'通常攻撃なし':'移動範囲なし'};
  if(kind==='attack'&&limit<=0)return {kind,state:'blocked',label:'攻撃権なし'};
  if(kind==='move'?piece.m:remaining===0)return {kind,state:'spent',label:(kind==='move'?'移動':'攻撃')+' 済'};
  if(!rights[kind])return {kind,state:'blocked',label:(kind==='move'?'移動':'攻撃')+' 不可：'+reason};
  return {kind,state:'ready',label:kind==='move'?'移動 可':limit>1?'攻撃 残り'+remaining+'回':'攻撃 可'};
 };
 return {hp:piece.hp,maxHp:definition.hp,atk:power,patterns,move:action('move'),attack:{...action('attack'),remaining,limit}};
}
const ACTION_SVG={
 move:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8v8l5 3 2 1v5H3v-6l3-3Z"/><path class="iconCut" d="M4 16h6m-1-9h4m-4 3h4"/></svg>',
 attack:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 2 2 2-12 13-3-3Z"/><path class="iconCut" d="m4 12 8 8M3 21l5-5"/></svg>'
};
function actionBadge(action){return `<span class="actionBadge ${action.kind} ${action.state}" data-action-state="${action.state}" aria-label="${escape(action.label)}" title="${escape(action.label)}">${ACTION_SVG[action.kind]}<i class="spentSlash"></i>${action.kind==='attack'&&action.limit>1&&action.state!=='none'?`<b class="actionCount">${action.remaining}</b>`:''}</span>`;}
function healthHTML(hp){return `<span class="hpNumber">${escape(hp)}</span><span class="hpTrack"><span class="hpFill"></span></span>`;}
function updateRoyalHealth(){
 for(const kind of ['player','enemy']){const hud=document.querySelector('.royalHP.'+kind),stat=hud?.querySelector('.kingStat'),value=stat?.querySelector('b');if(!value)continue;
  // Preserve the original live HP node/update path and the existing king HP ceiling (20).
  for(const node of [...stat.childNodes])if(node!==value)node.remove();
  const hp=Number(value.textContent);stat.classList.add('hpNumber');
  let track=hud.querySelector('.hpTrack');if(!track){track=document.createElement('span');track.className='hpTrack';track.innerHTML='<span class="hpFill"></span>';hud.append(track);}
  track.firstChild.style.width=Math.max(0,Math.min(100,hp/20*100))+'%';hud.dataset.hp=hp;hud.dataset.maxHp=20;hud.setAttribute('aria-label',(kind==='player'?'自分':'相手')+'の王 HP '+hp+' / 20');
 }
}
function renderPieces(model){
 current=model;syncLayout();
 const overlay=$("pieceOverlay"), board=$("board");
 if(!overlay||!board||!board.getClientRects().length||!board.clientWidth||!board.clientHeight)return;
 overlay.innerHTML="";
 prepareCells(board.querySelectorAll(".cell"));
 projectCells(board.querySelectorAll(".cell"),board.closest(".boardWrap"));
 positionRoyalPedestals();updateRoyalHealth();
 const wrapRect=overlay.getBoundingClientRect();
 const cells=board.querySelectorAll(".cell");
 const cellRects=[...cells].map(c=>c.getBoundingClientRect());
 const pitch=Math.min(Math.max(...cellRects.map(r=>r.right))-Math.min(...cellRects.map(r=>r.left)),Math.max(...cellRects.map(r=>r.bottom))-Math.min(...cellRects.map(r=>r.top)))/5;
 const compactHUD=pitch<64;overlay.dataset.hudSize=compactHUD?'compact':'regular';
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
  if(projected){const a=screenPoint(cell.querySelector('[data-plane-point="left"]'),overlay),b=screenPoint(cell.querySelector('[data-plane-point="right"]'),overlay);width=projectedPieceWidth(a,b);height=width;v.style.zIndex=String(100+Math.round(y));v.dataset.footX=x;v.dataset.footY=y;}
  v.style.setProperty('--piece-w',width+'px');v.style.setProperty('--piece-h',height+'px');
  const display=model.describe(p,index);
  v.classList.add('combatHUD');if(compactHUD)v.classList.add('compactHUD');
  v.dataset.hp=display.hp;v.dataset.maxHp=display.maxHp;v.dataset.atk=display.atk;
  if(enchantVisual)v.style.setProperty("--creature-aura",enchantVisual.colors[0]||"#b985ff");
  v.innerHTML=`<div class="overlayNameLayer" title="${escape(p.type)}">${escape(p.type)}</div>${enchantVisual?'<div class="creatureEnchantVisual"></div>':''}<div class="overlayOrb"></div><img class="overlayCreatureAsset" alt="" aria-hidden="true"><div class="combatStack"><div class="overlayStatsLayer combatFeet"><span class="creatureATK" aria-label="攻撃力 ${display.atk}">${ACTION_SVG.attack}<b>${escape(display.atk)}</b></span><span class="actionBadges">${actionBadge(display.move)}${actionBadge(display.attack)}</span></div><div class="creatureHealth" aria-label="HP ${display.hp} / ${display.maxHp}">${healthHTML(display.hp,display.maxHp)}</div></div>`;
  v.querySelector('.hpFill').style.width=(display.maxHp>0?Math.max(0,Math.min(100,display.hp/display.maxHp*100)):0)+'%';
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
let handScrollUpdate=null;
function bindHandScroll(){
 if(handScrollUpdate)return handScrollUpdate;
 const hand=$('hand');if(!hand)return ()=>{};
 const arrows=direction=>[...document.querySelectorAll(direction<0?'#handScrollLeft,[data-scroll-hand="-1"]':'#handScrollRight,[data-scroll-hand="1"]')];
 const update=()=>{
  const rect=hand.getBoundingClientRect(),overflow=hand.scrollWidth>hand.clientWidth+3;
  for(const direction of [-1,1]){
   const on=rect.width>0&&overflow&&(direction<0?hand.scrollLeft>3:hand.scrollLeft+hand.clientWidth<hand.scrollWidth-3);
   for(const el of arrows(direction)){
    const visible=on&&!(el.classList.contains('scrollHint')&&landscapeQuery.matches);
    el.hidden=!visible;el.disabled=!visible;el.classList.toggle('show',visible);
    if(el.classList.contains('scrollHint')){el.style.left=(direction<0?rect.left+3:rect.right-18)+'px';el.style.top=(rect.top+rect.height/2-10)+'px';}
   }
  }
 };
 for(const direction of [-1,1])for(const el of arrows(direction))if(el.tagName==='BUTTON')el.onclick=()=>{hand.scrollBy({left:direction*Math.max(100,hand.clientWidth*.75),behavior:'instant'});update();};
 hand.addEventListener('scroll',update,{passive:true});
 window.addEventListener('resize',update);window.addEventListener('orientationchange',update);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(hand);
 if(typeof MutationObserver!=='undefined')new MutationObserver(update).observe(hand,{childList:true,subtree:true,characterData:true});
 handScrollUpdate=update;update();return update;
}

const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const infoLine=x=>`<div class="infoLine">${escape(x)}</div>`;
 function attackStatus(piece,limit){const remaining=Math.max(0,limit-(piece.attacksUsed??(piece.a?limit:0)));return limit>1?(remaining?`攻撃 残${remaining}`:'攻撃 済'):(remaining?'攻撃 可':'攻撃 済');}
 function creatureInfoHTML({piece:p,viewer,definition:d,power:current,display,range,abilityHTML='',description='',berserkDescription='基本攻撃力2倍、移動・攻撃は前方1マスのみ。',cellEffects=[]}){
  return `<div class="infoName creatureInfoName">${escape(p.type)}</div><div class="creatureBasics">`+infoLine(`${p.side===viewer?'自軍':'敵軍'} / コスト ${d.cost}`)+infoLine(`HP ${p.hp} / ${d.hp}　ATK ${current.total}（基本 ${current.base}${current.dancer?` / 踊り子 +${current.dancer}`:''}${current.pack?` / 味方 +${current.pack}`:''}）`)+infoLine(`${display.move.label} / ${display.attack.label}`)+range+'</div>'+abilityHTML+(d.abilities?.length?`<div class="infoEffect">${escape(description)}</div>`:'')+(p.berserk>0?`<div class="infoEffect">バーサーク：残り${p.berserk}ターン<br>${escape(berserkDescription)}</div>`:'')+(current.battle?`<div class="infoEffect">決戦：${current.battleTurns.map(t=>t+'T').join('・')} / ATK +${current.battle}</div>`:'')+cellEffects.map(e=>`<div class="infoEffect">このマス：${escape(e.cardId)} 残り${e.remainingTurns}ターン<br>${escape(e.description||'')}</div>`).join('');
 }
 function graveyardHTML(cards,label){const counts=new Map();for(const c of cards)counts.set(c.cardId,(counts.get(c.cardId)||0)+1);return `<div class="infoName">${escape(label)}の墓地 🪦${cards.length}</div>`+(cards.length?[...counts].map(([id,n])=>infoLine(`${id} ×${n}`)).join(''):infoLine('墓地は空です。'))+infoLine('カードは元の持ち主の墓地に入ります。');}
 function globalEffectsHTML(cards){return `<div class="infoName">全体エンチャント 🔮${cards.length}</div>`+(cards.length?cards.map(c=>`<button type="button" class="globalEnchantButton" data-effect-detail="${escape(c.instanceId)}">《${escape(c.cardId)}》${c.remainingTurns!=null?`　残り${c.remainingTurns}ターン`:''}</button>`).join(''):infoLine('効果中の全体エンチャントはありません。'));}
 function globalDetailHTML(card,definition,description){return card?`<div class="infoName">${escape(card.cardId)}</div>`+infoLine(`全体エンチャント / コスト ${definition?.cost??'-'}`)+(card.remainingTurns!=null?infoLine(`残り ${card.remainingTurns}ターン`):'')+`<div class="infoEffect">${escape(description||'')}</div><button type="button" class="useCardButton" data-effects-back>一覧に戻る</button>`:`<div class="infoName">全体エンチャント</div>`+infoLine('このエンチャントの効果は終了しました。');}
 function bindInfoScroll(){const panel=$('infoContent'),up=$('infoScrollUp'),down=$('infoScrollDown');if(!panel||!up||!down)return ()=>{};const update=()=>{const r=panel.getBoundingClientRect(),can=panel.scrollHeight>panel.clientHeight+3;for(const [el,on,y]of [[up,can&&panel.scrollTop>3,r.top+4],[down,can&&panel.scrollTop+panel.clientHeight<panel.scrollHeight-3,r.bottom-20]]){el.classList.toggle('show',on);el.style.left=(r.left+r.width/2-8)+'px';el.style.top=y+'px';}};panel.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(panel);return update;}
 function hitBurst(element,{id,remaining=710}={}){if(!element||matchMedia('(prefers-reduced-motion: reduce)').matches)return;element.querySelectorAll('.sharedHitBurst').forEach(n=>n.remove());const burst=document.createElement('span');burst.className='sharedHitBurst';burst.textContent='✴️';burst.dataset.hitFx=String(id);burst.style.animationDuration=Math.max(80,remaining)+'ms';element.append(burst);return burst;}
globalThis.NormalGameUI=Object.freeze({setNotice,renderSelectionStatus,startPlayPresentation,tutorialSelectors,refreshTutorialGeometry,presentTutorial,clear(){current=null;},renderPieces,creatureDisplay,ACTION_SVG,positionRoyalPedestals,cardHTML,rangeDiagram,rangePair,requestCreatureAsset,createVisualSettings,renderTurn,bindHandScroll,attackStatus,creatureInfoHTML,graveyardHTML,globalEffectsHTML,globalDetailHTML,bindInfoScroll,hitBurst});
})();
