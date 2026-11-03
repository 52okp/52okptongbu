import {channels,createPlan,summary,dateLabel,toutiaoTime,beijingNow} from './lib/planner-model.js';
import {setupLibrary} from './lib/planner-library.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[],selected=null,pending=0,failed=false,saveQueue=Promise.resolve();
const categoryNames={unset:'待填写头条时间',waiting:'等待 72 小时到期',pending:'可发布',complete:'已完成'};
$('filter').innerHTML='<option value="all">全部计划</option>'+Object.entries(categoryNames).map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('');
function current(){return items.find(p=>p.id===selected);}
function renderList(){
 const visible=items.filter(p=>p.title.toLowerCase().includes($('search').value.toLowerCase())&&($('filter').value==='all'||summary(p).category===$('filter').value));
 $('list').innerHTML=visible.map(p=>{const s=summary(p);return '<button class="card '+(p.id===selected?'selected':'')+'" data-id="'+esc(p.id)+'"><strong>'+esc(p.title)+'</strong><small>'+categoryNames[s.category]+' · 已发布 '+s.done+'/'+s.total+'</small><small>其他平台：'+dateLabel(s.unlock)+'</small></button>';}).join('')||'<p>没有符合条件的计划</p>';
 $('list').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(failed){$('saveState').textContent='请先保存当前修改';return;}selected=b.dataset.id;renderList();renderDetail();});
}
function refreshHints(){
 const p=current();if(!p)return;const s=summary(p),remaining=s.unlock-Date.now();
 $('timeNote').textContent=s.unlock?'其他平台可发布时间：'+dateLabel(s.unlock)+(remaining>0?' · 还需 '+Math.ceil(remaining/3600000)+' 小时':' · 已到时间'):'填写头条发布时间后，自动计算其他平台的时间。';
 for(const [id] of channels.filter(([id])=>id!=='toutiao')){const c=p.channels[id];$('when-'+id).textContent=c.status==='published'?'已手动标记发布':c.status==='skip'?'暂不发布':dateLabel(s.unlock);}
 renderList();
}
function persist(){
 const p=current();if(!p)return;
 if(!p.title.trim()){failed=true;$('saveState').textContent='标题不能为空，尚未保存';return;}
 const snapshot=structuredClone(p);pending++;$('saveState').textContent='正在保存…';
 saveQueue=saveQueue.catch(()=>{}).then(()=>window.planner.put(snapshot)).then(()=>{failed=false;},e=>{failed=true;$('saveState').textContent='保存失败：'+e.message;}).finally(()=>{pending--;if(!pending&&!failed)$('saveState').textContent='已保存到本地';});
}
function timeOptions(count,value){return '<option value="">请选择</option>'+Array.from({length:count},(_,i)=>{const n=String(i).padStart(2,'0');return '<option value="'+n+'" '+(n===value?'selected':'')+'>'+n+'</option>';}).join('');}
function renderDetail(){
 const p=current();if(!p){$('detail').innerHTML='<div class="empty">选择或新建计划，填写头条发布时间即可。</div>';return;}
 const savedTime=toutiaoTime(p);
 $('detail').innerHTML='<label for="title">文章标题</label><input id="title" maxlength="200" value="'+esc(p.title)+'"><label for="toutiaoDate">头条发布时间（北京时间）</label><div class="row"><input id="toutiaoDate" type="date" aria-label="发布日期" value="'+esc(savedTime.slice(0,10))+'"><select id="toutiaoHour" aria-label="发布小时">'+timeOptions(24,savedTime.slice(11,13))+'</select><span>时</span><select id="toutiaoMinute" aria-label="发布分钟">'+timeOptions(60,savedTime.slice(14,16))+'</select><span>分</span><button id="timeNow" type="button">使用当前时间</button></div><p class="hint">不区分定时或即时发布，以你填写的时间计算 72 小时。首发默认开启；平台实际时间变化时，请修改这里。</p><div id="timeNote" class="banner"></div>'+
 channels.filter(([id])=>id!=='toutiao').map(([id,name])=>{const c=p.channels[id];return '<div class="channel"><div class="row"><h3>'+name+'</h3><span id="when-'+id+'" class="hint"></span><button data-mark="'+id+'">'+(c.status==='published'?'✓ 已发布 · 撤销标记':c.status==='skip'?'加入发布清单':'标记已发布')+'</button>'+(c.status!=='skip'&&c.status!=='published'?'<button data-skip="'+id+'">暂不发布</button>':'')+'</div></div>';}).join('')+
 '<label for="notes">备注</label><textarea id="notes">'+esc(p.notes)+'</textarea><button id="retry">立即保存</button> <button id="delete" class="danger">删除本地计划</button>';
 for(const key of ['title','notes'])$(key).addEventListener('input',()=>{p[key]=$(key).value;renderList();persist();});
 const saveTime=()=>{const date=$('toutiaoDate').value,hour=$('toutiaoHour').value,minute=$('toutiaoMinute').value;p.toutiaoTime=date&&hour!==''&&minute!==''?date+'T'+hour+':'+minute:'';p.exclusive=true;refreshHints();persist();};
 for(const id of ['toutiaoDate','toutiaoHour','toutiaoMinute'])$(id).onchange=saveTime;
 $('timeNow').onclick=()=>{const now=beijingNow();$('toutiaoDate').value=now.slice(0,10);$('toutiaoHour').value=now.slice(11,13);$('toutiaoMinute').value=now.slice(14,16);saveTime();};
 $('detail').querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>{const c=p.channels[b.dataset.mark];if(c.status==='published'){c.status='pending';delete c.markedAt;}else if(c.status==='skip'){c.status='pending';}else{c.status='published';c.markedAt=Date.now();}persist();renderDetail();});
 $('detail').querySelectorAll('[data-skip]').forEach(b=>b.onclick=()=>{p.channels[b.dataset.skip].status='skip';persist();renderDetail();});
 $('retry').onclick=persist;
 $('delete').onclick=async()=>{if(!confirm('只删除本地计划，不删除文章。继续吗？'))return;await saveQueue;try{await window.planner.remove(p.id);items=items.filter(x=>x.id!==p.id);selected=null;failed=false;renderList();renderDetail();}catch(e){$('saveState').textContent=e.message;}};
 refreshHints();
}
$('new').onclick=()=>{if(failed)return;const p=createPlan('新文章计划');items.unshift(p);selected=p.id;renderList();renderDetail();persist();$('title').focus();$('title').select();};
$('search').oninput=renderList;$('filter').onchange=renderList;
window.addEventListener('beforeunload',e=>{if(pending||failed){e.preventDefault();e.returnValue='';$('saveState').textContent='请等待保存完成，或点击立即保存后关闭。';}});
setInterval(()=>{renderList();refreshHints();},30000);
async function reload(){await saveQueue;if(failed)return;items=await window.planner.list();renderList();renderDetail();}
window.addEventListener('focus',()=>reload().catch(e=>$('saveState').textContent=e.message));
reload().catch(e=>{$('saveState').textContent='读取失败：'+e.message;$('new').disabled=true;});
setupLibrary(reload);
