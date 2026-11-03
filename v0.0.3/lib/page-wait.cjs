function loadEditor(wc,url,timeoutMs=20000){
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);wc.removeListener('dom-ready',ready);error?reject(error):resolve();};
  const ready=()=>{if(wc.getURL()&&wc.getURL()!=='about:blank')finish();};
  const timer=setTimeout(()=>{finish(new Error('编辑器加载超过 20 秒，已停止。请先打开平台确认登录和网络后重试。'));try{wc.stop();}catch{}},timeoutMs);
  wc.on('dom-ready',ready);
  wc.loadURL(url).then(ready,error=>finish(error));
 });
}
function executeWithTimeout(wc,script,onTimeout,timeoutMs=50000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{try{onTimeout();}finally{reject(new Error('编辑器操作超时，已关闭自动操作页面以防止继续提交。请到平台核对草稿，不要直接重复同步。'));}},timeoutMs);
  wc.executeJavaScript(script,true).then(resolve,reject).finally(()=>clearTimeout(timer));
 });
}
module.exports={loadEditor,executeWithTimeout};
