'use strict';
// This presenter receives counts and confirmed draw events, never card identities.
globalThis.CardResourceUI=(()=>{
 const $=id=>document.getElementById(id);
 let counts=null,layer=null,fan=null,own=null,enemy=null,flights=null;
 const timers=new Set(),animations=new Set();
 const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 function back(){const card=document.createElement('span');card.className='cardBack';card.setAttribute('aria-hidden','true');return card;}
 function deck(label,side){
  const element=document.createElement('div'),pile=document.createElement('span'),text=document.createElement('span');
  element.className='resourceDeck '+side;pile.className='resourcePile';text.className='resourceDeckLabel';
  element.dataset.side=side;element.append(pile,text);element.setAttribute('aria-label',label+'の山札');
  return element;
 }
 function ensure(){
  if(layer)return;
  layer=document.createElement('div');layer.id='cardResourceLayer';
  fan=document.createElement('div');fan.id='opponentHandBacks';fan.className='resourceHand enemy';
  own=deck('自分','own');enemy=deck('相手','enemy');
  flights=document.createElement('div');flights.id='drawFlightLayer';flights.setAttribute('aria-hidden','true');
  layer.append(fan,own,enemy);document.body.append(layer,flights);
 }
 function updateDeck(element,n,label){
  const pile=element.firstChild,level=Math.min(4,Math.ceil(n/10));
  pile.replaceChildren(...Array.from({length:level},(_,i)=>{const card=back();card.style.setProperty('--stack',i);return card;}));
  pile.classList.toggle('empty',n===0);
  element.lastChild.textContent=label+'山札 '+n;element.setAttribute('aria-label',label+'の山札 '+n+'枚');
  element.dataset.count=n;
 }
 function place(element,x,y,width,height){
  Object.assign(element.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px'});
 }
 function rect(element){return element?.getBoundingClientRect();}
 // Stay beside the existing own graveyard; never reserve layout space.
 function royalRect(element){
  const r=rect(element),width=Number(element.dataset.layoutWidth)||r.width;
  return {left:r.left+(r.width-width)/2,right:r.right+(width-r.width)/2,top:r.top,bottom:r.bottom,width,height:r.height};
 }
 function positionOwnDeck(){
  const group=globalThis.NormalGameUI?.landscapeRoyalResourceGroup();
  if(group){own.hidden=false;const d=group.deck;place(own,d.left,d.top,d.width,d.height);return;}
  const grave=rect(document.querySelector('.royalGrave.player .graveButton'));
  const column=rect(document.querySelector('.boardColumn'));
  if(!grave?.width||!column?.width)return;
  const width=65,height=24,gap=6;
  const obstacles=[...document.querySelectorAll('#board .cell,.royalPlatform,.crownModel,.royalDetails,.graveButton,#hand,#infoPanel,.manaStat,#turnIndicator,.layoutLog,.battleStrip,.gameTopBar button,.appHeader button,#endTurn,#undoOne,#onlineUndo,#onlineSurrender,.layoutHandScroll,#latestAction')]
   .filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>e.classList.contains('royalDetails')?royalRect(e):rect(e)).filter(r=>r.width&&r.height);
  const candidates=[];
  const add=(x,y)=>{
   if(x<Math.max(2,column.left)||x+width>Math.min(innerWidth-2,column.right)||y<column.top||y+height>Math.min(innerHeight-2,column.bottom))return;
   if(obstacles.some(r=>x<r.right+2&&x+width>r.left-2&&y<r.bottom+2&&y+height>r.top-2))return;
   candidates.push({x,y,distance:Math.hypot(x+width/2-grave.left-grave.width/2,y+height/2-grave.top-grave.height/2)});
  };
  for(const x of [grave.right+gap,grave.left,grave.right-width,grave.left-width-gap,grave.left+(grave.width-width)/2])
   for(const y of [grave.top+(grave.height-height)/2,grave.top-height-gap,grave.bottom+gap])add(x,y);
  if(!candidates.length)for(let y=column.top;y+height<=column.bottom;y+=6)
   for(let x=column.left;x+width<=column.right;x+=6)add(x,y);
  candidates.sort((a,b)=>a.distance-b.distance);
  const chosen=candidates[0];
  // An impossibly small viewport must not cover a game control.
  own.hidden=!chosen;if(chosen)place(own,chosen.x,chosen.y,width,height);
 }
 function position(){
  if(!layer)return;
  const app=$('app'),appRect=rect(app),match=$('match');
  const hidden=!counts||!appRect?.width||app.classList.contains('gameScreenHidden')||match?.hidden;
  layer.hidden=hidden;if(hidden)return;
  const landscape=document.body.classList.contains('layout-landscape');
  own.hidden=false;
  if(landscape){
   const bar=document.querySelector('.gameTopBar,.appHeader'),r=rect(bar);
   if(!r)return;
   const buttons=[...bar.querySelectorAll('button')].filter(b=>rect(b).width>0);
   const title=buttons.find(b=>b.id!=='settingsButton'),settings=$('settingsButton');
   const left=(title?rect(title).right:r.left)+7,right=(rect(settings)?.left??r.right)-7;
   const height=Math.min(28,r.height-4),top=r.top+2;
   let segments=[[left,right]];
   for(const hud of document.querySelectorAll('.royalDetails')){
    const h=royalRect(hud);if(h.top>top+height+6||h.bottom<top-6)continue;
    segments=segments.flatMap(([a,b])=>h.right+6<=a||h.left-6>=b?[[a,b]]:
     [[a,Math.max(a,h.left-6)],[Math.min(b,h.right+6),b]].filter(([a,b])=>b-a>=18));
   }
   segments.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
   const main=segments[0]??[left,right],width=main[1]-main[0];
   if(width<136&&segments[1]?.[1]-segments[1]?.[0]>=53){
    const spare=segments[1];
    place(enemy,spare[0],top,53,height);
    place(fan,main[0],top,width,height);
   }else{
    const deckWidth=width<220?53:65;
    place(enemy,main[0],top,deckWidth,height);
    place(fan,main[0]+deckWidth+6,top,Math.max(18,width-deckWidth-6),height);
   }
   positionOwnDeck();
  }else{
   const turn=rect($('turnIndicator')),info=rect($('infoPanel')),column=rect(document.querySelector('.boardColumn'));
   const title=rect(document.querySelector('.handTitle'));
   if(!turn||!column||!title)return;
   const left=turn.right+6,right=Math.min(info?.left??column.right,column.right)-5;
   place(fan,left,turn.top,Math.max(18,right-left),Math.min(28,turn.height));
   const health=rect(document.querySelector('.royalDetails.enemy'));
   const enemyTop=turn.bottom+5;
   const healthAtDeck=health&&health.top<enemyTop+24&&health.bottom>enemyTop;
   place(enemy,healthAtDeck?column.right-75:column.left+3,enemyTop,72,24);
   place(own,appRect.right-77,title.top-1,72,Math.min(24,Math.max(18,rect($('hand')).top-title.top-2)));
  }
  const fanRect=fan.getBoundingClientRect();
  const width=Math.min(fanRect.width,Math.max(56,18+Math.max(0,counts.enemyHand-1)*12));
  place(fan,fanRect.left+(fanRect.width-width)/2,fanRect.top,width,fanRect.height);
  const cardWidth=Math.min(18,width);
  fan.style.setProperty('--back-width',cardWidth+'px');
  fan.style.setProperty('--back-spread',(counts.enemyHand>1?Math.max(0,(width-cardWidth)/(counts.enemyHand-1)):0)+'px');
 }
 function render(next){
  ensure();
  const safe={enemyHand:count(next.enemyHand),ownDeck:count(next.ownDeck),enemyDeck:count(next.enemyDeck)};
  if(!counts||safe.enemyHand!==counts.enemyHand){
   const label=document.createElement('span');label.className='resourceHandLabel';label.textContent='手札 '+safe.enemyHand+'枚';
   fan.replaceChildren(...Array.from({length:safe.enemyHand},(_,i)=>{const card=back();card.style.setProperty('--index',i);return card;}),label);
   fan.classList.toggle('empty',safe.enemyHand===0);fan.dataset.count=safe.enemyHand;
   fan.setAttribute('aria-label','相手の手札 '+safe.enemyHand+'枚');
  }
  if(!counts||safe.ownDeck!==counts.ownDeck)updateDeck(own,safe.ownDeck,'自分');
  if(!counts||safe.enemyDeck!==counts.enemyDeck)updateDeck(enemy,safe.enemyDeck,'相手');
  counts=safe;position();
 }
 function clearAnimations(){
  for(const timer of timers)clearTimeout(timer);timers.clear();
  for(const animation of animations)animation.cancel();animations.clear();
  flights?.replaceChildren();
 }
 function presentDraws(events,viewer){
  if(document.visibilityState!=='visible'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const draws=events.filter(e=>e.type==='card:drawn'&&e.reason!=='initial'&&['p','c'].includes(e.side));
  if(!draws.length)return;
  ensure();position();
  if(layer.hidden)return;
  const spacing=draws.length>1?Math.min(65,180/(draws.length-1)):0;
  draws.forEach((event,i)=>{
   const timer=setTimeout(()=>{
    timers.delete(timer);
    if(layer.hidden||document.visibilityState!=='visible')return;
    const isOwn=event.side===viewer,from=rect((isOwn?own:enemy).firstChild),to=rect(isOwn?$('hand'):fan);
    if(!from?.width||!to?.width)return;
    const card=back();card.classList.add('drawFlight',isOwn?'own':'enemy');
    const x=from.left+from.width/2-9,y=from.top+from.height/2-13;
    card.style.left=x+'px';card.style.top=y+'px';flights.append(card);
    const endX=isOwn?Math.min(to.right-9,to.left+45):to.left+to.width/2-9;
    const endY=to.top+Math.min(to.height,44)/2-13;
    const animation=card.animate([{transform:'translate(0,0)'},{transform:'translate('+(endX-x)+'px,'+(endY-y)+'px)'}],{duration:300,easing:'ease-out'});
    animations.add(animation);
    const remove=()=>{animations.delete(animation);card.remove();};
    animation.finished.then(remove,remove);
   },i*spacing);
   timers.add(timer);
  });
 }
 function clear(){clearAnimations();counts=null;if(layer)layer.hidden=true;}
 for(const name of ['resize','orientationchange'])window.addEventListener(name,()=>{clearAnimations();position();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')clearAnimations();else position();});
 window.addEventListener('pagehide',clearAnimations);
 document.addEventListener('p2b1:exit',clear);
 return Object.freeze({render,position,presentDraws,clearAnimations,clear});
})();
