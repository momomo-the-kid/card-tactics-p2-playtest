(function(root,factory){const api={create:factory};if(typeof module==='object'&&module.exports)module.exports=api;else root.CardTacticsDeckLibrary=api;})(globalThis,function(rules,storage){
'use strict';
const key='cardTacticsDeckLibraryV1',oldConfirmed='cardTacticsDeckConfirmedV1',oldDraft='cardTacticsDeckDraftV1',copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(rules.normalize(a))===JSON.stringify(rules.normalize(b));
function legacy(k){try{const s=storage.getItem(k);return s===null?null:JSON.parse(s);}catch{return null;}}
function fallback(){const raw=legacy(oldConfirmed),counts=rules.valid(raw)?rules.normalize(raw):rules.defaultCounts(),draft=legacy(oldDraft),name=rules.valid(raw)?'引継ぎデッキ':'標準デッキ';return {version:1,slots:[{id:'deck-1',name,draft:rules.isRecord(draft)?rules.normalize(draft):copy(counts)}],active:{slotId:'deck-1',name,counts:copy(counts)}};}
function valid(s){return s?.version===1&&Array.isArray(s.slots)&&s.slots.length>=1&&s.slots.length<=5&&new Set(s.slots.map(x=>x?.id)).size===s.slots.length&&s.slots.every(x=>typeof x?.id==='string'&&/^deck-[1-5]$/.test(x.id)&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=40&&rules.isRecord(x.draft)&&rules.inspect(x.draft).errors.length===0)&&s.slots.some(x=>x.id===s.active?.slotId)&&typeof s.active?.name==='string'&&s.active.name.length>0&&s.active.name.length<=40&&rules.valid(s.active.counts);}
function read(){let text;try{text=storage.getItem(key);}catch{return {state:fallback(),raw:null,blocked:true,error:'保存データを読み込めません。旧データ／標準デッキを使用します。保存はできません。'};}
if(text===null)return {state:fallback(),raw:null,blocked:false,migration:true,error:''};
try{const state=JSON.parse(text);if(!valid(state))throw Error();for(const slot of state.slots)slot.draft=rules.normalize(slot.draft);state.active.counts=rules.normalize(state.active.counts);return {state,raw:text,blocked:false,error:''};}catch{return {state:fallback(),raw:text,blocked:true,error:'複数デッキ保存が破損しています。原文を保持し、旧データ／標準デッキを使用します。上書き保存は停止しています。'};}}
function write(session,next){if(session.blocked)return {ok:false,error:session.error};if(!valid(next))return {ok:false,error:'デッキデータが不正なため保存できません。'};try{if(storage.getItem(key)!==session.raw)return {ok:false,error:'別タブで保存内容が変わりました。編集中の内容は未保存です。「保存内容を再読込」で確認してください。'};const raw=JSON.stringify(next);storage.setItem(key,raw);session.state=copy(next);session.raw=raw;session.migration=false;session.error='';return {ok:true};}catch{return {ok:false,error:'このブラウザへ保存できませんでした。変更は未保存です。容量・保存許可を確認し、再試行してください。'};}}
function open(){const s=read();if(s.migration){const result=write(s,s.state);if(!result.ok)s.error=result.error;}return s;}
function active(){const s=read();return {name:s.state.active.name,counts:copy(s.state.active.counts),error:s.error};}
return {key,capacity:5,same,open,read,write,active,cardIds(){return rules.toCardIds(active().counts)||rules.toCardIds(rules.defaultCounts());}};
});
