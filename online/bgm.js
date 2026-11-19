'use strict';
/* Shared local audio preferences and playback. No game state or network ownership. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else if(!root.CardTacticsBGM)root.CardTacticsBGM=factory({
  storage:(()=>{try{return root.localStorage;}catch(e){return null;}})(),document:root.document,Audio:root.Audio,
  AudioContext:root.AudioContext||root.webkitAudioContext,fetch:root.fetch?.bind(root),
  source:new URL(root.document.body.dataset.bgmSource||'assets/audio/battle.m4a',root.document.baseURI).href
 });
})(typeof globalThis==='object'?globalThis:this,function({storage,document,Audio,AudioContext,fetch,source}){
 const key='cardTacticsBGM';
 const listeners=new Set();
 let enabled=false,volume=50,active=false,unlocked=false,status='stopped';
 let context,gain,buffer,voice,startTime,offset=0,loading,resuming;
 let useMedia=false,audio,mediaGain,mediaPending,mediaInterrupted=false,blocked=false,unavailable=false;
 try{const v=JSON.parse(storage.getItem(key)||'{}');if(typeof v?.enabled==='boolean')enabled=v.enabled;if(Number.isFinite(v?.volume)&&v.volume>=0&&v.volume<=100)volume=v.volume;}catch{}
 const visible=()=>document.visibilityState!=='hidden';
 const wanted=()=>enabled&&active&&visible()&&unlocked;
 const notify=()=>{for(const fn of listeners)fn({enabled,volume,status});};
 function setStatus(next){if(status===next)return;status=next;notify();}
 function save(){try{storage.setItem(key,JSON.stringify({enabled,volume}));}catch{}}
 function getAudioContext(){
  if(!context&&AudioContext)context=new AudioContext();
  return context;
 }
 function applyVolume(){
  // Slider 100 now has the same gain as slider 25 in v75.
  const level=volume/400;
  if(gain)gain.gain.value=level;
  if(mediaGain)mediaGain.gain.value=level;
  else if(audio){
   audio.volume=level;
   // Some native players ignore volume writes. Never start at an uncontrolled level.
   audio.muted=level===0||Math.abs(audio.volume-level)>.0001;
  }
 }
 function stop(reset=false){
  if(voice){
   offset=(offset+Math.max(0,context.currentTime-startTime))%buffer.duration;
   voice.stop();voice.disconnect();voice=null;
  }
  if(audio){
   if(mediaPending)mediaInterrupted=true;
   audio.pause();
   if(reset)try{audio.currentTime=0;}catch{}
  }
  if(reset)offset=0;
  setStatus('stopped');
 }
 function resumeGraph(ctx,retry){
  if(!ctx||ctx.state==='running'||resuming&&!retry)return;
  const request=ctx.resume();
  resuming=request;
  request.then(()=>{
   if(resuming!==request)return;
   resuming=null;
   if(wanted()&&ctx.state==='running')reconcile();
  },()=>{
   if(resuming!==request)return;
   resuming=null;
   if(wanted()){blocked=true;setStatus('blocked');}
  });
 }
 function loadBuffer(ctx){
  if(loading)return;
  loading=Promise.resolve().then(()=>fetch(source)).then(response=>{
   if(!response.ok)throw Error('BGM fetch failed');
   return response.arrayBuffer();
  }).then(bytes=>ctx.decodeAudioData(bytes)).then(decoded=>{
   if(!decoded.length||!decoded.duration)throw Error('Empty BGM');
   buffer=decoded;
  }).catch(()=>{useMedia=true;}).finally(()=>{
   loading=null;
   if(wanted())reconcile();
  });
 }
 function playBuffer(ctx,retry){
  resumeGraph(ctx,retry);
  if(!buffer){loadBuffer(ctx);setStatus('starting');return;}
  if(ctx.state!=='running'){setStatus('starting');return;}
  if(!voice){
   if(!gain){gain=ctx.createGain();gain.connect(ctx.destination);applyVolume();}
   const next=ctx.createBufferSource();
   next.buffer=buffer;next.loop=true;next.loopEnd=buffer.duration;next.connect(gain);
   startTime=ctx.currentTime;
   next.start(startTime,offset);
   voice=next;
  }
  setStatus('playing');
 }
 function playMedia(ctx,retry){
  if(!audio){
   audio=new Audio(source);audio.loop=true;audio.preload='none';
   audio.addEventListener('error',()=>{unavailable=true;audio.pause();setStatus('unavailable');});
   if(ctx)try{
    const out=ctx.createGain(),node=ctx.createMediaElementSource(audio);
    node.connect(out);out.connect(ctx.destination);mediaGain=out;
   }catch{}
   applyVolume();
  }
  if(mediaGain)resumeGraph(ctx,retry);
  if(mediaPending)return;
  if(!audio.paused){setStatus(!mediaGain||ctx.state==='running'?'playing':'starting');return;}
  setStatus('starting');
  mediaPending=Promise.resolve(audio.play());
  mediaPending.then(()=>{
   if(wanted())setStatus(!mediaGain||ctx.state==='running'?'playing':'starting');
   else stop(!enabled||!active);
  },error=>{
   if(!wanted()||(mediaInterrupted&&error?.name==='AbortError'))return;
   blocked=error?.name==='NotAllowedError';unavailable=!blocked;
   setStatus(blocked?'blocked':'unavailable');
  }).finally(()=>{
   mediaPending=null;
   const interrupted=mediaInterrupted;mediaInterrupted=false;
   if(interrupted&&wanted()&&!unavailable&&!blocked)reconcile();
  });
 }
 function reconcile(retry=false){
  if(!wanted()){stop(!enabled||!active);return;}
  if(unavailable||blocked)return;
  let ctx;
  try{ctx=getAudioContext();}catch{}
  if(!useMedia&&ctx?.decodeAudioData&&ctx.createBufferSource&&fetch){
   try{playBuffer(ctx,retry);return;}catch{useMedia=true;}
  }
  useMedia=true;
  try{playMedia(ctx,retry);}catch{unavailable=true;setStatus('unavailable');}
 }
 function gesture(e){
  if(e&&e.isTrusted===false)return;
  unlocked=true;blocked=false;
  // A touch pointerdown may precede activation. Retry on the trusted click.
  reconcile(e?.type==='click');
 }
 document.addEventListener('pointerdown',gesture,true);
 document.addEventListener('click',gesture,true);
 document.addEventListener('keydown',gesture,true);
 document.addEventListener('visibilitychange',()=>{if(visible())blocked=false;reconcile();});
 document.addEventListener('p2b1:exit',()=>api.setActive(false));
 document.defaultView?.addEventListener('pagehide',()=>{active=false;stop(true);});
 const api={
  getAudioContext,
  get state(){return {enabled,volume,status};},
  setEnabled(value){enabled=value===true;blocked=false;if(enabled)unavailable=false;save();reconcile();notify();},
  setVolume(value){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(100,value));save();applyVolume();notify();},
  setActive(value){const next=value===true;if(active===next)return;active=next;reconcile();},
  subscribe(fn){listeners.add(fn);fn(api.state);return ()=>listeners.delete(fn);}
 };
 return api;
});
