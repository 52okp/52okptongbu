const platformSites=[
  {key:'toutiao',name:'头条',url:'https://mp.toutiao.com/'},
  {key:'baijiahao',name:'百家号',url:'https://baijiahao.baidu.com/'},
  {key:'csdn',name:'CSDN',url:'https://editor.csdn.net/md/'},
  {key:'xiaohongshu',name:'小红书',url:'https://creator.xiaohongshu.com/'},
  {key:'bilibili',name:'哔哩哔哩',url:'https://member.bilibili.com/'},
  {key:'zhihu',name:'知乎',url:'https://zhuanlan.zhihu.com/write'},
  {key:'weibo',name:'微博',url:'https://card.weibo.com/article/v5/editor'}
];
const $=id=>document.getElementById(id);
let customSites=[],activePlatform=null;
let selectedMainView='workspace';

function platformForUrl(value){
  const host=new URL(value).hostname;
  const suffixes={csdn:'csdn.net',weibo:'weibo.com',zhihu:'zhihu.com',xiaohongshu:'xiaohongshu.com',baijiahao:'baidu.com',toutiao:'toutiao.com',bilibili:'bilibili.com'};
  return platformSites.find(site=>host===suffixes[site.key]||host.endsWith(`.${suffixes[site.key]}`))?.key
    ||customSites.find(site=>new URL(site.url).hostname===host)?.key;
}
window.chrome ||= {};
window.chrome.storage={local:{get:keys=>window.workbench.storageGet(keys),set:values=>window.workbench.storageSet(values),remove:keys=>window.workbench.storageRemove(keys)}};
window.chrome.cookies={get:details=>window.workbench.getPlatformCookie(window.workbench.currentPlatform(),details)};
window.chrome.permissions={contains:async()=>true,request:async()=>true};
window.chrome.tabs={
  create:async options=>{const key=platformForUrl(options.url);if(!key)throw new Error('这个网站尚未添加到工作台');await window.workbench.openPlatform(key,options.url);return {id:key};},
  remove:async id=>window.workbench.closePlatformTab(window.workbench.currentPlatform(),id)
};

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function findSite(key){return platformSites.find(site=>site.key===key)||customSites.find(site=>site.key===key);}
function renderLoginTabs(){
  const sites=[...platformSites,...customSites];
  $('loginTabs').innerHTML=sites.map(site=>`<button class="login-tab ${site.key===activePlatform?'selected':''}" data-site="${escapeHtml(site.key)}" title="${escapeHtml(site.url)}"><span class="tab-dot"></span><span>${escapeHtml(site.name)}</span><small>${site.key===activePlatform?'当前':'打开'}</small></button>`).join('');
  $('loginTabs').querySelectorAll('[data-site]').forEach(button=>button.onclick=()=>window.workbench.openPlatform(button.dataset.site).catch(showError));
}
function showError(error){$('message').textContent=error?.message||String(error);$('message').className='error';}
function layoutBrowser(){if(!$('browserViewport').hidden){const r=$('browserViewport').getBoundingClientRect();window.workbench.browserBounds({x:r.x,y:r.y,width:r.width,height:r.height});}}
function updateMainView(){
  const browsing=!!activePlatform;
  $('workspace').hidden=browsing||selectedMainView!=='workspace';
  $('history').hidden=browsing||selectedMainView!=='history';
  $('browserToolbar').hidden=!browsing;$('browserViewport').hidden=!browsing;
  $('workspaceTab').classList.toggle('active',!browsing&&selectedMainView==='workspace');
  $('historyTab').classList.toggle('active',!browsing&&selectedMainView==='history');
  if(browsing)layoutBrowser();
}
function activateBrowser(key){activePlatform=key;updateMainView();renderLoginTabs();}
function showMainView(view){selectedMainView=view;activePlatform=null;updateMainView();window.workbench.browserHide();}
window.workbench.onBrowserActive(activateBrowser);
window.workbench.onBrowserState(state=>{
  if(state.platform!==activePlatform)return;
  $('address').value=state.url||'';
  $('loginStatus').textContent=state.loading?'正在加载…':`${findSite(state.platform)?.name||'网站'} 页面`;
});
window.workbench.onBrowserResize(layoutBrowser);
window.workbench.onBrowserError(showError);
window.workbench.onMenuAddSite(()=>$('addSite').click());
window.workbench.onMenuWorkspace(()=>showMainView('workspace'));
async function openCsdnSettings(){
  try{
    const status=await window.workbench.getCsdnCredentialStatus();
    $('csdnCredentialStatus').textContent=status.configured?'本机已配置凭据；Secret 不可回显，可直接输入新值替换。':'尚未配置本机凭据。';
    $('csdnAppKey').value='';$('csdnSecret').value='';$('csdnSettingsDialog').showModal();
  }catch(error){alert(`读取 CSDN 凭据状态失败：${error.message||error}`);}
}
window.workbench.onMenuCsdnSettings(openCsdnSettings);
window.workbench.onUpdateProgress(progress=>{
  const button=$('checkUpdates');
  if(!button.disabled)return;
  const percent=progress.total?Math.min(99,Math.floor(progress.received*100/progress.total)):0;
  button.textContent=progress.total?`正在下载更新 ${percent}%`:'正在下载更新…';
});
window.addEventListener('resize',layoutBrowser);
$('workspaceTab').onclick=()=>showMainView('workspace');
$('historyTab').onclick=()=>showMainView('history');
$('back').onclick=()=>activePlatform&&window.workbench.browserBack(activePlatform);
$('forward').onclick=()=>activePlatform&&window.workbench.browserForward(activePlatform);
$('reload').onclick=()=>activePlatform&&window.workbench.browserReload(activePlatform);
$('addressForm').onsubmit=event=>{event.preventDefault();if(activePlatform)window.workbench.browserNavigate(activePlatform,$('address').value).catch(showError);};
$('addSite').onclick=()=>{$('siteName').value='';$('siteUrl').value='';$('addSiteDialog').showModal();};
$('cancelAddSite').onclick=()=>$('addSiteDialog').close();
$('addSiteForm').onsubmit=async event=>{
  event.preventDefault();
  try{
    const site=await window.workbench.addSite({name:$('siteName').value,url:$('siteUrl').value});
    customSites.push(site);renderLoginTabs();$('addSiteDialog').close();
    await window.workbench.openPlatform(site.key);
  }catch(error){$('siteUrl').setCustomValidity(error.message||'添加网站失败');$('siteUrl').reportValidity();}
};
$('checkUpdates').onclick=async()=>{
  const button=$('checkUpdates');
  button.disabled=true;button.textContent='正在检查更新…';
  try{
    const update=await window.workbench.checkForUpdates();
    if(!update.available){alert(`当前版本 ${update.currentVersion} 已是最新版本。`);return;}
    const notes=update.notes?`\n\n更新说明：\n${update.notes}`:'';
    if(!confirm(`发现新版本 ${update.latestVersion}（当前 ${update.currentVersion}）。\n\n将从 GitHub 下载并校验更新包，随后在独立目录启动新版本；本地文章和登录会话会保留。${notes}\n\n现在更新吗？`))return;
    button.textContent='正在准备更新…';
    await window.workbench.installUpdate();
    button.textContent='正在启动新版本…';
  }catch(error){alert(`检查或安装更新失败：${error.message||error}`);}
  finally{if(!button.isConnected)return;button.disabled=false;button.textContent='检查更新';}
};
$('cancelCsdnSettings').onclick=()=>$('csdnSettingsDialog').close();
$('csdnSettingsForm').onsubmit=async event=>{
  event.preventDefault();
  try{
    await window.workbench.saveCsdnCredentials({appKey:$('csdnAppKey').value,secret:$('csdnSecret').value});
    $('csdnAppKey').value='';$('csdnSecret').value='';$('csdnCredentialStatus').textContent='已使用 Windows DPAPI 加密保存。';
    $('csdnSettingsDialog').close();
  }catch(error){$('csdnCredentialStatus').textContent=error.message||String(error);}
};
$('clearCsdnCredentials').onclick=async()=>{
  if(!confirm('确认清除本机保存的 CSDN 凭据？之后 CSDN 自动同步需要重新配置。'))return;
  try{await window.workbench.clearCsdnCredentials();$('csdnAppKey').value='';$('csdnSecret').value='';$('csdnCredentialStatus').textContent='本机凭据已清除。';}
  catch(error){$('csdnCredentialStatus').textContent=error.message||String(error);}
};
window.workbench.listSites().then(sites=>{customSites=sites;renderLoginTabs();}).catch(showError);
