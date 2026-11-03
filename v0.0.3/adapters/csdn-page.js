// Runs inside CSDN's own editor. Uses its native store and Save Draft control.
export async function csdnEditorAction(action,input={}){
 try{
  if(location.origin!=='https://editor.csdn.net'||!location.pathname.startsWith('/md'))throw new Error('请先在软件内登录 CSDN Markdown 编辑器');
  let store;
  for(let i=0;i<60;i++){
   store=document.querySelector('#app')?.__vue__?.$store;
   if(!store){for(const el of [...document.querySelectorAll('body *')].slice(0,5000)){if(el.__vue__?.$store){store=el.__vue__.$store;break;}}}
   if(store?.getters['file/current']&&store?.getters['content/current'])break;
   await new Promise(r=>setTimeout(r,250));
  }
  if(!store?.getters['file/current']||!store?.getters['content/current'])throw new Error('CSDN 编辑器未就绪或页面结构已变化，请打开编辑器检查');
  const account=decodeURIComponent(document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('UserName='))?.slice(9)||'');
  if(!account)throw new Error('CSDN 登录状态失效，请重新登录');
  if(action==='account')return {ok:true,data:{id:account,name:account}};
  if(input.account!==account)throw new Error('CSDN 登录账号已变化，已停止操作');
  if(action==='prepare'){
   if(!store._mutations?.['content/setItem']||!store._mutations?.['file/setItem']||!store._mutations?.['file/setCurrentId'])throw new Error('CSDN 编辑器版本变化，无法安全新建草稿');
   const id=crypto.randomUUID();
   store.commit('content/setItem',{id:id+'/content',text:input.markdown,properties:'',discussions:{},comments:{}});
   store.commit('file/setItem',{id,name:input.title,articleid:'',articlestatus:'',scheduled_time:0,articletype:'original',readType:'public',parentId:null,tags:'',categories:'',descr:'',coverimages:[],covertype:1});
   store.commit('file/setCurrentId',id);
   await new Promise(r=>setTimeout(r,500));
   const file=store.getters['file/current'],content=store.getters['content/current'];
   if(file.id!==id||file.articleid||file.scheduled_time||file.name!==input.title||content.text!==input.markdown)throw new Error('CSDN 新建草稿内容未能正确载入，已停止');
   return {ok:true,data:{localId:id}};
  }
  const file=store.getters['file/current'],content=store.getters['content/current'];
  if(file.name!==input.title||content.text?.replace(/\r\n/g,'\n').trim()!==input.markdown.replace(/\r\n/g,'\n').trim())throw new Error('CSDN 草稿标题或正文与本地文章不一致，请人工核对');
  if(action==='save'){
   if(file.id!==input.localId||file.articleid||file.scheduled_time||!['',2,'2'].includes(file.articlestatus))throw new Error('页面已切换或已保存，请检查原草稿，不重复提交');
   const button=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&!b.disabled&&(b.getAttribute('data-title')==='保存草稿'||b.textContent.trim()==='保存草稿')&&!b.classList.contains('btn-publish'));
   if(!button)throw new Error('找不到明确的“保存草稿”按钮，已停止；不会点击发布');
   button.click();
   for(let i=0;i<100;i++){
    const saved=store.getters['file/current'];
    if(saved.id!==input.localId)throw new Error('保存期间编辑器切换了文章，请检查草稿箱');
    if(/^\d+$/.test(String(saved.articleid||''))&&Number(saved.articlestatus)===2)return {ok:true,data:{draftId:String(saved.articleid)}};
    await new Promise(r=>setTimeout(r,300));
   }
   throw new Error('尚未确认云端草稿保存，请在编辑器检查登录、验证和保存状态，不要重复新建');
  }
  if(action==='verify'){
   if(String(file.articleid)!==String(input.draftId)||Number(file.articlestatus)!==2||file.scheduled_time>0)throw new Error('重新打开后未确认是对应的非定时草稿，请人工检查');
   return {ok:true,data:{draftId:String(file.articleid)}};
  }
  throw new Error('不支持的编辑器操作');
 }catch(e){return {ok:false,error:e.message};}
}
