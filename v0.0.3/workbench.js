import {readImportFile} from "./lib/import.js";
import {platforms,byId,validateArticle} from "./lib/model.js";
import {sanitize,markdownToHtml,escapeHtml,imageUrls} from "./lib/content.js";
import {checkAuth} from "./adapters/cloud.js";
import {withHeaders} from "./lib/runtime.js";
import {runPlatform,recoverInterrupted} from "./lib/jobs.js";
const $=id=>document.getElementById(id);
let source="",busy=false,previewing=false;
const selected=()=>platforms.filter(p=>$("select-"+p.id).checked);
const displayPlatforms=["toutiao","baijiahao","csdn","xiaohongshu","bilibili","zhihu","weibo"].map(byId);
function status(id,text,kind=""){const el=$("status-"+id);el.textContent=text;el.className="platform-state "+kind;}
function message(text,error=false){$("message").textContent=text;$("message").className=error?"error":"";}
function setBusy(value){
  busy=value;
  for(const el of document.querySelectorAll("button,input,select,textarea")) el.disabled=value;
}
async function exclusive(fn){
  await navigator.locks.request("article-sync-workbench",{ifAvailable:true},async lock=>{
    if(!lock){message("另一个工作台正在操作，请等待它完成。",true);return;}
    setBusy(true);
    try{await fn();}catch(e){message(e.message,true);}finally{setBusy(false);}
  });
}
for(const p of displayPlatforms){
  const row=document.createElement("div");row.className="platform";
  row.innerHTML='<input type="checkbox" checked id="select-'+p.id+'" aria-label="选择'+p.name+'"><span class="badge"></span><div><div class="platform-name"></div><div class="platform-note"></div><div class="platform-state" id="status-'+p.id+'">尚未检测登录</div><div class="platform-actions"><a target="_blank" rel="noopener noreferrer">登录 / 创作中心</a><a class="result" target="_blank" rel="noopener noreferrer" hidden>查看草稿 ↗</a></div></div>';
  row.querySelector(".badge").style.background=p.color;row.querySelector(".badge").textContent=p.badge;
  row.querySelector(".platform-name").textContent=p.name;row.querySelector(".platform-note").textContent=p.note;
  row.querySelector("a").href=p.home;row.querySelector("a").removeAttribute("target");row.querySelector("a").onclick=event=>{event.preventDefault();window.workbench.openPlatform(p.id,p.home);};row.querySelector(".result").id="result-"+p.id;
  const single=document.createElement("button");single.className="quiet single-sync";single.id="sync-"+p.id;single.textContent="单独同步";
  single.onclick=()=>syncTargets([p]);
  row.querySelector(".platform-name").append(single);
  row.querySelector("input").onchange=()=>{$("selectionCount").textContent="已选择 "+selected().length+" 个平台";};
  $("platforms").append(row);
}
const help=document.createElement("dialog");help.id="zhihu-help";
help.innerHTML='<h2>知乎需要你检查</h2><p id="zhihu-help-message"></p><p class="hint">将在新标签页打开知乎。若平台显示登录或验证码，请自行完成。插件不会读取验证码，也不会自动重复提交。</p><div class="help-actions"><button id="zhihu-open" class="quiet">打开知乎检查 / 验证</button><button id="zhihu-retry" class="quiet">已完成验证，只重试知乎</button><button id="zhihu-close" class="quiet">稍后处理</button></div>';
document.body.append(help);
let attentionSubmitted=false,attentionUrl="https://www.zhihu.com/",attentionPlatform="zhihu";
function showZhihuHelp(error,platform=error.platform||"zhihu"){
  const meta=byId(platform)||byId("zhihu");attentionPlatform=meta.id;
  help.querySelector("h2").textContent=meta.name+"需要你检查";
  help.querySelector(".hint").textContent="将在新标签页打开平台页面。请自行完成登录或平台要求的验证，插件不会读取验证码或自动重复提交。";
  $("zhihu-open").textContent="打开"+meta.name+"检查 / 验证";
  $("zhihu-retry").textContent="已完成检查，只重试"+meta.name;
  attentionSubmitted=!!error.submitted;
  attentionUrl=error.verifyUrl||error.draftUrl||meta.editor;
  $("zhihu-help-message").textContent=error.message+(attentionSubmitted?"。保存请求已发出，请检查原草稿的正文和图片；完整后在任务记录中标记成功，不要直接重新提交。":"。检查完成后可只重试当前平台；若仍被拒绝，需要继续检查接口适配。");
  $("zhihu-retry").hidden=attentionSubmitted||!!error.signatureRejected;
  if(!help.open)help.showModal();
}
$("zhihu-open").onclick=async()=>{try{await chrome.tabs.create({url:attentionUrl,active:true});}catch(e){message(e.message,true);}};
$("zhihu-retry").onclick=()=>{if(busy||attentionSubmitted)return;help.close();syncTargets([byId(attentionPlatform)]);};
$("zhihu-close").onclick=()=>help.close();
function article(){
  let html=$("body").value;
  if($("format").value==="markdown") html=markdownToHtml(html);
  if($("format").value==="text") html=html.split(/\n\s*\n/).map(s=>"<p>"+escapeHtml(s).replace(/\n/g,"<br>")+"</p>").join("");
  html=sanitize(html,source||undefined);
  const doc=new DOMParser().parseFromString(html,"text/html");
  return {title:$("title").value.trim(),html,source,textLength:[...(doc.body.textContent||"").trim()].length};
}
function update(){
  try{const a=article();$("counts").textContent=a.textLength+" 字 · "+imageUrls(a.html).length+" 张图片";}
  catch{$("counts").textContent="含不可用图片，请预览检查";}
  if(previewing) preview();
}
function preview(){
  try{
    const a=article();
    // Opaque sandbox and CSP prohibit scripts, forms and external navigation.
    $("preview").srcdoc='<!doctype html><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data:; style-src \'unsafe-inline\';"><style>body{font:15px/1.9 sans-serif;padding:18px;color:#243b30;overflow-wrap:anywhere}img{max-width:100%}pre{white-space:pre-wrap;background:#f2f4f3;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}</style><h1>'+escapeHtml(a.title)+"</h1>"+a.html;
  }catch(e){message(e.message,true);}
}
$("previewButton").onclick=()=>{
  previewing=!previewing;$("preview").hidden=!previewing;$("body").hidden=previewing;
  $("previewButton").textContent=previewing?"编辑":"预览";if(previewing)preview();
};
let saveTimer;
for(const id of ["title","body","format"]) $(id).addEventListener("input",()=>{
  update();clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>chrome.storage.local.set({editor:{title:$("title").value,body:$("body").value,format:$("format").value,source}}).catch(e=>message("本地自动保存失败："+e.message,true)),400);
});
$("importFile").onclick=()=>$("file").click();
async function importFiles(files){
  if(busy){message("当前任务正在进行，请完成后再导入文件。",true);return;}
  if(files.length!==1){message("每次请拖入或选择一个文件。",true);return;}
  await exclusive(async()=>{
    clearTimeout(saveTimer);
    message("正在导入 "+files[0].name+"…");
    const imported=await readImportFile(files[0]);
    // Persist before changing the UI so storage failures preserve the old article.
    await chrome.storage.local.set({editor:imported});
    $("body").value=imported.body;$("title").value=imported.title;
    $("format").value=imported.format;source="";
    $("source").textContent="来自本地文件："+files[0].name;
    previewing=true;$("preview").hidden=false;$("body").hidden=true;$("previewButton").textContent="编辑";
    update();
    for(const p of platforms){status(p.id,"文章已导入，待同步");$("result-"+p.id).hidden=true;}
    message("导入成功。"+imported.warnings.join("；"));
  });
}
$("file").onchange=async()=>{
  const files=[...$("file").files];$("file").value="";
  if(files.length)await importFiles(files);
};
let dragDepth=0;
const isFileDrag=event=>[...(event.dataTransfer?.types||[])].includes("Files");
window.addEventListener("dragenter",event=>{
  if(!isFileDrag(event))return;event.preventDefault();dragDepth++;
  if(!busy)document.body.classList.add("dragging-file");
});
window.addEventListener("dragover",event=>{
  if(!isFileDrag(event))return;event.preventDefault();event.dataTransfer.dropEffect=busy?"none":"copy";
});
window.addEventListener("dragleave",event=>{
  if(!isFileDrag(event))return;dragDepth=Math.max(0,dragDepth-1);
  if(!dragDepth)document.body.classList.remove("dragging-file");
});
window.addEventListener("drop",async event=>{
  if(!isFileDrag(event))return;event.preventDefault();dragDepth=0;
  document.body.classList.remove("dragging-file");
  await importFiles([...event.dataTransfer.files]);
});
window.addEventListener("blur",()=>{dragDepth=0;document.body.classList.remove("dragging-file");});
$("export").onclick=()=>{
  try{
    const a=article(),url=URL.createObjectURL(new Blob(['<!doctype html><meta charset="UTF-8"><title>'+escapeHtml(a.title)+'</title><h1>'+escapeHtml(a.title)+'</h1>'+a.html],{type:"text/html;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=(a.title||"article").replace(/[\\/:*?"<>|]/g,"_")+".html";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){message(e.message,true);}
};
$("checkAll").onclick=()=>exclusive(async()=>{
  for(const p of platforms){
    status(p.id,"正在检查…");
    try{const user=await withHeaders(p.id,()=>checkAuth(p.id));status(p.id,"已登录 · "+user.name,"success");}
    catch(e){status(p.id,e.message,"error");}
  }
});
async function syncTargets(targets){
  if(busy)return;
  let a,origins;
  try{
    a=article();if(!targets.length)throw new Error("请至少选择一个平台");
    for(const p of targets)validateArticle(a,p.id);
    origins=[...new Set(imageUrls(a.html).filter(u=>!u.startsWith("data:")).map(u=>new URL(u).origin+"/*"))];
    if(targets.some(p=>p.id==="csdn")&&imageUrls(a.html).length)origins.push("https://*.myhuaweicloud.com/*","https://*.aliyuncs.com/*");
    // Call within the click's activation, before any other awaited operation.
    if(origins.length&&!await chrome.permissions.request({origins}))throw new Error("需要允许读取正文图片所在的网站，才能转存图片");
  }catch(e){message(e.message,true);return;}
  await exclusive(async()=>{
    message("正在同步，请保持本页打开…");let done=0,reused=0,attention=null;
    for(const p of targets){
      $("result-"+p.id).hidden=true;
      try{
        const result=await runPlatform(p.id,a,text=>status(p.id,text),previous=>confirm(p.name+"已保存过同名文章「"+previous.title+"」，但本次内容与记录不同。继续会新建草稿，不会更新原草稿。确定继续吗？"),(id,account,article)=>{
          const count=imageUrls(article.html).length;
          const imageAction=count?`下载并上传 ${count} 张正文图片。`:"文章没有正文图片。";
          const draftType=id==="xiaohongshu"?"当前软件会话内的小红书本地草稿":"平台云端草稿";
          return confirm(`目标平台：${p.name}\n当前账号：${account.name}（${account.id}）\n文章：${article.title}\n操作：${imageAction}保存为${draftType}。\n不会公开发布。\n\n确认继续吗？`);
        });
        status(p.id,(result.reused?"已跳过：之前同步成功 · ":"本次已新建 · ")+result.note,"success");
        const link=$("result-"+p.id);link.href=result.url;link.hidden=false;done++;if(result.reused)reused++;
      }catch(e){status(p.id,e.message,"error");if(e.needsAttention)attention=e;}
      await renderHistory();
    }
    message("完成："+done+"/"+targets.length+" 个平台处理成功；新建 "+(done-reused)+" 个，跳过已同步 "+reused+" 个。");
    if(attention)showZhihuHelp(attention);
  });
}
$("sync").onclick=()=>syncTargets(selected());
async function renderHistory(){
  const data=await chrome.storage.local.get(null),records=Object.entries(data).filter(([k])=>k.startsWith("job:")).sort((a,b)=>b[1].updated-a[1].updated);
  $("historyRows").replaceChildren();
  if(!records.length){const p=document.createElement("p");p.className="hint";p.textContent="还没有同步任务。";$("historyRows").append(p);return;}
  for(const [key,r] of records.slice(0,40)){
    const row=document.createElement("div");row.className="history-row";
    const info=document.createElement("div"),title=document.createElement("strong"),time=document.createElement("small");
    title.textContent=r.title;time.textContent=new Date(r.updated).toLocaleString("zh-CN")+" · "+r.accountName;
    info.append(title,document.createElement("br"),time);
    const platform=document.createElement("div");platform.textContent=byId(r.platform)?.name||r.platform;
    const detail=document.createElement("div"),state=document.createElement("p");
    state.textContent=({done:"已保存草稿",failed:"失败，可重试",uncertain:"结果待确认",interrupted:"上次任务中断",running:"处理中",submitting:"保存中"})[r.phase]||r.phase;
    state.className=r.phase==="done"?"success":"";detail.append(state);
    if(r.error){const error=document.createElement("p");error.textContent=r.error;detail.append(error);}
    const url=r.result?.url||r.url||byId(r.platform)?.editor;
    if(url){const link=document.createElement("a");link.href=url;link.textContent="打开平台检查 ↗";link.onclick=event=>{event.preventDefault();window.workbench.openPlatform(r.platform,url);};detail.append(link);}
    if(["zhihu","csdn","weibo"].includes(r.platform)&&r.draftId&&r.phase!=="done"){
      const confirmed=document.createElement("button");confirmed.className="quiet";confirmed.textContent="已核对完整，标记成功";
      confirmed.onclick=()=>exclusive(async()=>{
        if(!confirm("请确认已打开这条记录对应的平台草稿，并检查其仍为草稿，标题、正文和图片完整。此操作只修正本地记录，不会再次上传或新建草稿。"))return;
        const result={draftId:r.draftId,url:r.url||byId(r.platform).editor,note:(byId(r.platform)?.name||r.platform)+"草稿（用户已核对）"};
        await chrome.storage.local.set({[key]:{...r,phase:"done",result,error:"",updated:Date.now()}});
        await renderHistory();message("已标记成功，再次同步相同内容将跳过此草稿。");
      });detail.append(confirmed);
    }
    if(["uncertain","running","submitting"].includes(r.phase)&&!(["zhihu","csdn","weibo"].includes(r.platform)&&r.draftId)){
      const retry=document.createElement("button");retry.className="quiet";retry.textContent="已检查：未保存，允许重新提交";
      retry.onclick=()=>exclusive(async()=>{
        if(!confirm("请确认已经检查该账号的草稿箱，文章没有保存。继续会允许重新提交，若原请求已成功可能生成重复草稿。"))return;
        await chrome.storage.local.set({[key]:{...r,phase:"failed",submitted:false,error:"用户检查后解锁重试",updated:Date.now()}});
        await renderHistory();
      });detail.append(retry);
    }
    row.append(info,platform,detail);$("historyRows").append(row);
  }
}
$("refreshHistory").onclick=renderHistory;
window.addEventListener("beforeunload",event=>{if(busy){event.preventDefault();event.returnValue="";}});
async function init(){
  const stored=(await chrome.storage.local.get("editor")).editor;
  if(stored){$("title").value=stored.title||"";$("body").value=stored.body||"";$("format").value=stored.format||"html";source=stored.source||"";}
  const id=new URL(location.href).searchParams.get("import");
  if(id){
    const key="import:"+id,entry=(await chrome.storage.local.get(key))[key];
    if(entry?.draft?.html){$("title").value=entry.draft.title||"";$("body").value=entry.draft.html;$("format").value="html";source=entry.draft.source||"";}
    else if(entry?.error)message(entry.error,true);
    await chrome.storage.local.remove(key);
    await chrome.storage.local.set({editor:{title:$("title").value,body:$("body").value,format:$("format").value,source}});
  }
  $("source").textContent=source?"来源："+source:"支持 Markdown、HTML 和纯文本";update();
  await navigator.locks.request("article-sync-workbench",{ifAvailable:true},async lock=>{if(lock)await recoverInterrupted();});
  await renderHistory();
}
setBusy(true);
init().catch(e=>message(e.message,true)).finally(()=>setBusy(false));
