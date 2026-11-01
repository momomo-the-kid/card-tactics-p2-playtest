'use strict';
/* Shared local audio preferences and playback. No game state or network ownership. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else if(!root.CardTacticsBGM)root.CardTacticsBGM=factory({
  storage:(()=>{try{return root.localStorage;}catch(e){return null;}})(),document:root.document,Audio:root.Audio,
  AudioContext:root.AudioContext||root.webkitAudioContext,
  source:new URL(root.document.body.dataset.bgmSource||'assets/audio/battle.mp3',root.document.baseURI).href
 });
})(typeof globalThis==='object'?globalThis:this,function({storage,document,Audio,AudioContext,source}){
 const key='cardTacticsBGM';
 let enabled=false,volume=50,active=false,unlocked=false,audio=null,context=null,gain=null;
 let pending=null,blocked=false,unavailable=false,status='stopped';
 const listeners=new Set();
 try{const v=JSON.parse(storage.getItem(key)||'{}');if(typeof v?.enabled==='boolean')enabled=v.enabled;if(Number.isFinite(v?.volume)&&v.volume>=0&&v.volume<=100)volume=v.volume;}catch(e){}
 const visible=()=>document.visibilityState!=='hidden';
 const wanted=()=>enabled&&active&&visible()&&unlocked;
 const notify=()=>{for(const fn of listeners)fn({enabled,volume,status});};
 function save(){try{storage.setItem(key,JSON.stringify({enabled,volume}));}catch(e){}}
 function applyVolume(){
  if(!audio)return;
  // GainNode works on iOS where HTMLMediaElement.volume may be read-only in practice.
  if(gain){gain.gain.value=volume/100;audio.volume=1;}else audio.volume=volume/100;
 }
 function prepare(){
  if(!audio){audio=new Audio(source);audio.loop=true;audio.preload='none';audio.addEventListener('error',()=>{unavailable=true;audio.pause();status='unavailable';notify();});}
  if(!context&&AudioContext){
   try{const ctx=new AudioContext(),node=ctx.createMediaElementSource(audio),g=ctx.createGain();node.connect(g);g.connect(ctx.destination);context=ctx;gain=g;}catch(e){/* Native volume remains a fallback. */}
  }
  applyVolume();
 }
 function stop(reset=false){if(audio){audio.pause();if(reset)try{audio.currentTime=0;}catch(e){}}status='stopped';}
 function reconcile(){
  if(!wanted()){stop(!enabled||!active);notify();return;}
  if(unavailable||blocked||pending)return;
  try{
   prepare();if(!audio.paused){status='playing';notify();return;}
   // Invoke resume/play in the user event stack when available; contain both rejections.
   const resumed=context&&context.state!=='running'?context.resume():Promise.resolve();
   const played=audio.play();
   pending=Promise.all([resumed,played]);status='starting';notify();
   pending.then(()=>{if(!wanted())stop(!enabled||!active);else status='playing';},e=>{
    audio.pause();if(wanted()){blocked=e?.name==='NotAllowedError';unavailable=!blocked;status=blocked?'blocked':'unavailable';}
   }).finally(()=>{pending=null;notify();});
  }catch(e){stop();blocked=e?.name==='NotAllowedError';unavailable=!blocked;status=blocked?'blocked':'unavailable';notify();}
 }
 function gesture(e){if(e&&e.isTrusted===false)return;unlocked=true;blocked=false;reconcile();}
 document.addEventListener('pointerdown',gesture,true);
 document.addEventListener('keydown',gesture,true);
 document.addEventListener('visibilitychange',()=>{if(visible())blocked=false;reconcile();});
 document.addEventListener('p2b1:exit',()=>api.setActive(false));
 const win=document.defaultView;
 win?.addEventListener('pagehide',()=>{active=false;stop(true);notify();});
 const api={
  get state(){return {enabled,volume,status};},
  setEnabled(value){enabled=value===true;blocked=false;if(enabled)unavailable=false;save();reconcile();},
  setVolume(value){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(100,value));save();applyVolume();notify();},
  setActive(value){const next=value===true;if(active===next)return;active=next;reconcile();},
  subscribe(fn){listeners.add(fn);fn(api.state);return ()=>listeners.delete(fn);}
 };
 return api;
});
