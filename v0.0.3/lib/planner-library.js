import {createPlan} from './planner-model.js';
export function setupLibrary(refreshPlans){
 const panel=document.createElement('section');panel.className='library';
 panel.innerHTML='<div class="row"><h2>本地文章</h2><input id="articleSearch" placeholder="搜索本地文章" aria-label="搜索本地文章"><button id="refreshArticles">刷新文章</button></div><p>点击“打开到工作台”，在准备文章中编辑，再同步到平台草稿。导入和编辑的文章会自动保存到这里。</p><div id="articleList"></div><p class="hint">数据位置：<span id="articlePath"></span></p><button id="articleLocation">更改数据位置</button><p id="libraryStatus" role="status"></p>';
 document.getElementById('librarySlot').append(panel);
 const $=id=>document.getElementById(id);let articles=[];
 function draw(){
  $('articleList').replaceChildren();
  for(const article of articles.filter(a=>(a.title||'').toLowerCase().includes($('articleSearch').value.toLowerCase()))){
   const row=document.createElement('div');row.className='article-entry';
   const title=document.createElement('strong');title.textContent=article.title||'未命名文章';
   const open=document.createElement('button');open.textContent='打开到工作台';
   open.onclick=async()=>{try{await window.planner.openDraft(article.id);$('libraryStatus').textContent='已请求在工作台打开；正在同步时会等待当前操作完成。';}catch(e){$('libraryStatus').textContent=e.message;}};
   const plan=document.createElement('button');plan.textContent='加入发布计划';
   plan.onclick=async()=>{plan.disabled=true;try{
    const reference=article.id==='editor'?'editor:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([article.title,article.body])))),b=>b.toString(16).padStart(2,'0')).join(''):article.id;
    const existing=(await window.planner.list()).find(p=>p.draftId===reference);
    if(!existing)await window.planner.put(createPlan(article.title||'未命名文章',reference));
    await refreshPlans();$('libraryStatus').textContent=existing?'这篇文章已加入计划':'已加入发布计划';
   }catch(e){$('libraryStatus').textContent=e.message;}finally{plan.disabled=false;}};
   const remove=document.createElement('button');remove.textContent='删除文章';remove.className='delete-article';
   remove.onclick=async()=>{
    if(!confirm('确认删除本地文章「'+(article.title||'未命名文章')+'」？此操作会删除本地正文备份，已有发布计划、同步记录和平台文章不受影响。'))return;
    remove.disabled=true;
    try{await window.planner.deleteDraft(article.id);await refresh();$('libraryStatus').textContent='本地文章已删除，发布计划已保留。';}
    catch(e){$('libraryStatus').textContent='删除失败：'+e.message;remove.disabled=false;}
   };
   row.append(title,open,plan,remove);$('articleList').append(row);
  }
  if(!$('articleList').children.length)$('articleList').textContent='暂无匹配文章。请先在工作台导入或编辑文章。';
 }
 async function refresh(){try{articles=await window.planner.drafts();$('articlePath').textContent=await window.planner.dataPath();draw();}catch(e){$('libraryStatus').textContent='读取本地文章失败：'+e.message;}}
 $('articleSearch').oninput=draw;$('refreshArticles').onclick=refresh;
 $('articleLocation').onclick=async()=>{try{await window.planner.chooseDataPath();await refresh();}catch(e){$('libraryStatus').textContent=e.message;}};
 window.addEventListener('focus',refresh);refresh();
}
