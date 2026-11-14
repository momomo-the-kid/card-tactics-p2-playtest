(function(root,factory){const api={create:factory};if(typeof module==='object'&&module.exports)module.exports=api;else root.CardTacticsDeckLibrary=api;})(globalThis,function(rules,storage){
'use strict';
// Keys are independent of the product build and shared by CPU / online.
const key='cardTacticsDeckLibraryV1',backupKey=key+'Backup',historyKey=key+'History',diagnosticKey=key+'Diagnostics';
const oldConfirmed='cardTacticsDeckConfirmedV1',oldDraft='cardTacticsDeckDraftV1',copy=x=>JSON.parse(JSON.stringify(x));
const validName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=40;
const same=(a,b)=>JSON.stringify(rules.normalize(a))===JSON.stringify(rules.normalize(b));
const conflict='別タブ／旧版の画面で保存内容が変わりました。自動上書きを停止しました。「保存内容を再読込」で確認してください。';
let events=[];
function get(k){try{const raw=storage.getItem(k);return {raw,status:raw===null?'missing':'present'};}catch{return {raw:null,status:'error'};}}
function note(event,fields={}){
 const doc=globalThis.document,loc=globalThis.location;
 const entry={at:new Date().toISOString(),build:doc?.querySelector('[data-build]')?.dataset.build||doc?.getElementById('buildLabel')?.textContent||'test',origin:loc?.origin||'test',path:loc?.pathname||'test',event,...fields};
 if(!events.length){try{const old=JSON.parse(storage.getItem(diagnosticKey));if(old?.version===1&&Array.isArray(old.events))events=old.events.slice(-39);}catch{}}
 events.push(entry);events=events.slice(-40);
 try{storage.setItem(diagnosticKey,JSON.stringify({version:1,events}));}catch{} // Diagnosis must never affect deck saving.
}
function valid(s){return s?.version===1&&Array.isArray(s.slots)&&s.slots.length>=1&&s.slots.length<=5&&new Set(s.slots.map(x=>x?.id)).size===s.slots.length&&s.slots.every(x=>typeof x?.id==='string'&&/^deck-[1-5]$/.test(x.id)&&validName(x.name)&&rules.isRecord(x.draft)&&rules.inspect(x.draft).errors.length===0)&&s.slots.some(x=>x.id===s.active?.slotId)&&validName(s.active?.name)&&rules.valid(s.active.counts);}
function parse(raw){try{const state=JSON.parse(raw);return valid(state)?state:null;}catch{return null;}}
function normalize(state){state=copy(state);for(const slot of state.slots)slot.draft=rules.normalize(slot.draft);state.active.counts=rules.normalize(state.active.counts);return state;}
function firstSlot(name,counts){return {version:1,slots:[{id:'deck-1',name,draft:copy(counts)}],active:{slotId:'deck-1',name,counts:copy(counts)}};}
const initialCounts=Object.freeze({
 オルトロス:2,ソーサラー:2,チャリオット:2,ディアブロ:1,バーサーク:1,ファイヤーボルト:2,ホープ:4,前線兵:2,
 剣聖:1,占い師:1,戦術指揮官:1,槍兵:2,盗賊:2,竜巻:2,精鋭兵:2,踊り子:2,転移魔法:1,金級兵:4,銀級兵:4,隠密:2
});
function legacy(){
 const c=get(oldConfirmed),d=get(oldDraft),state=firstSlot('標準デッキ',rules.defaultCounts());let error='';
 for(const x of [c,d])if(x.status==='error')error='旧形式の保存データを読み込めません。新規利用とは扱わず、上書き保存を停止しています。';
 let confirmed=null,draft=null;
 try{if(c.status==='present'){confirmed=JSON.parse(c.raw);if(!rules.valid(confirmed))throw Error();}}catch{error='旧形式の確定デッキが不正です。原文を保持し、上書き保存を停止しています。';}
 try{if(d.status==='present'){draft=JSON.parse(d.raw);if(!rules.isRecord(draft)||rules.inspect(draft).errors.length)throw Error();}}catch{draft=null;error='旧形式の下書きが不正です。原文を保持し、上書き保存を停止しています。';}
 if(confirmed&&rules.valid(confirmed)){state.active.counts=rules.normalize(confirmed);state.active.name=state.slots[0].name='引継ぎデッキ';state.slots[0].draft=copy(state.active.counts);}
 if(draft)state.slots[0].draft=rules.normalize(draft);
 return {state,error,source:c.status==='missing'&&d.status==='missing'?'default':'legacy',legacyConfirmed:c.status,legacyDraft:d.status};
}
function journal(raw){try{const b=JSON.parse(raw);return b?.version===1&&['confirmed','pending','previous'].every(k=>b[k]===null||typeof b[k]==='string'&&!!parse(b[k]))?b:null;}catch{return null;}}
function read(){
 const p=get(key),b=get(backupKey),h=get(historyKey),backup=journal(b.raw),primary=parse(p.raw);
 let state=primary,source='primary',error='',migration=false;
 if(!state&&backup){state=parse(backup.confirmed)||parse(backup.previous);source='backup';}
 if(!state){
  const old=legacy();state=old.state;source=old.source;
  if([p,b,h].every(x=>x.status==='missing')){
   error=old.error;
   if(!error&&source==='default'&&rules.valid(initialCounts)){
    state=firstSlot('初期デッキ',rules.normalize(initialCounts));source='initial';
   }
   migration=!error;
  }
  note('legacy-read',{confirmed:old.legacyConfirmed,draft:old.legacyDraft,result:old.error?'blocked':'ok'});
 }
 if([p,b,h].some(x=>x.status==='error'))error='保存データを読み込めません。表示は代替内容です。上書き保存を停止しています。';
 else if(p.status==='present'&&!primary)error='複数デッキ保存が破損しています。原文を保持し、上書き保存を停止しています。';
 else if(p.status==='missing'&&(b.status!=='missing'||h.status!=='missing'))error='以前の保存履歴がありますが、本体が見つかりません。新規デッキで上書きせず停止しています。表示はバックアップ／代替内容です。';
 else if(b.status==='present'&&!backup||h.status==='present'&&h.raw!=='1')error='保存保護データが不正です。本体と原文を保持し、上書き保存を停止しています。';
 else if(primary&&backup&&p.raw!==backup.confirmed&&p.raw!==backup.pending)error=conflict;
 else if(primary&&h.status==='present'&&b.status==='missing')error='保存保護データが見つかりません。本体を保持し、上書き保存を停止しています。';
 if(error)migration=false;
 note('read',{primary:p.status,backup:b.status,history:h.status,validation:primary?'ok':p.status==='present'?'invalid':'none',result:error?'blocked':'ok',source,migration});
 return {state:normalize(state),raw:p.raw,backupRaw:b.raw,historyRaw:h.raw,blocked:!!error,migration,error,source};
}
function unchanged(s){return storage.getItem(key)===s.raw&&storage.getItem(backupKey)===s.backupRaw&&storage.getItem(historyKey)===s.historyRaw&&(s.source!=='initial'||storage.getItem(oldConfirmed)===null&&storage.getItem(oldDraft)===null);}
function setBackup(s,value){const raw=JSON.stringify(value);storage.setItem(backupKey,raw);s.backupRaw=raw;}
function fail(event,error){note(event,{result:'failed'});return {ok:false,error};}
function protect(s){
 if(s.blocked||s.raw===null||s.backupRaw!==null)return;
 try{if(!unchanged(s))throw Error();setBackup(s,{version:1,confirmed:s.raw,pending:null,previous:null});storage.setItem(historyKey,'1');s.historyRaw='1';note('protection-created',{result:'ok'});}
 catch{s.blocked=true;s.error='保存保護を準備できませんでした。本体は変更していません。再読込して確認してください。';note('protection-created',{result:'failed'});}
}
function write(session,next){
 if(session.blocked)return fail('save-blocked',session.error);
 if(!valid(next))return fail('save-invalid','デッキデータが不正なため保存できません。');
 try{
  if(!unchanged(session))return fail('save-conflict',conflict);
  const raw=JSON.stringify(next),previous=session.raw;
  // Prepare the journal before touching the primary. Failed writes retain a confirmed snapshot.
  setBackup(session,{version:1,confirmed:previous,pending:raw,previous:journal(session.backupRaw)?.previous??null});
  storage.setItem(historyKey,'1');session.historyRaw='1';
  if(storage.getItem(key)!==previous)return fail('save-conflict',conflict);
  storage.setItem(key,raw);
  if(storage.getItem(key)!==raw)return fail('save-conflict',conflict);
  session.state=copy(next);session.raw=raw;session.migration=false;session.source='primary';
  setBackup(session,{version:1,confirmed:raw,pending:null,previous});
  session.error='';note('save',{result:'ok',migration:previous===null});return {ok:true};
 }catch{return fail('save-error','このブラウザへ保存できませんでした。変更は未保存、または保存確認が未完了です。再試行／再読込で確認してください。');}
}
function open(){const s=read();if(s.migration){const result=write(s,s.state);if(!result.ok)s.error=result.error;}else protect(s);return s;}
// New editors/imports share Web Locks. Raw comparisons also detect ordinary stale older pages.
async function exclusive(fn){try{if(globalThis.navigator?.locks)return await navigator.locks.request(key,fn);note('lock',{result:'unavailable'});return fn();}catch{note('lock',{result:'failed'});return {ok:false,error:'保存の排他制御を開始できません。再読込して確認してください。'};}}
async function openAsync(){const result=await exclusive(open);return result?.state?result:{...read(),blocked:true,error:result.error};}
function active(){const s=read();return {name:s.state.active.name,counts:copy(s.state.active.counts),error:s.error};}
function diagnostics(){return JSON.stringify({version:1,events},null,2);}
return {key,backupKey,historyKey,diagnosticKey,capacity:5,validName,same,open,openAsync,read,write,writeAsync:(s,n)=>exclusive(()=>write(s,n)),active,diagnostics,cardIds(){return rules.toCardIds(active().counts)||rules.toCardIds(rules.defaultCounts());}};
});
