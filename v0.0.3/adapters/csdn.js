import {pageTab,inPage} from '../lib/runtime.js';
import {csdnEditorAction} from './csdn-page.js';
const editor='https://editor.csdn.net/md/';
export async function checkCsdn(){
 const cookie=await window.workbench.getPlatformCookie('csdn',{url:'https://csdn.net',name:'UserName'});
 if(!cookie?.value)throw new Error('请先在软件左侧登录 CSDN');
 let name;try{name=decodeURIComponent(cookie.value);}catch{name=cookie.value;}
 return {id:name,name};
}
export function csdnMarkdown(html){
  const body=new DOMParser().parseFromString(html,"text/html").body;
  const render=n=>{
    if(n.nodeType===3)return n.textContent.replace(/([\\*_[\]])/g,"\\$1");
    if(n.nodeType!==1)return "";
    const tag=n.localName,inner=()=>[...n.childNodes].map(render).join("");
    if(tag==="table")return "\n\n"+n.outerHTML+"\n\n";
    if(tag==="pre"){const code=n.textContent,fence="~".repeat(Math.max(3,...(code.match(/~+/g)||[]).map(s=>s.length+1)));return "\n\n"+fence+"\n"+code+"\n"+fence+"\n\n";}
    if(tag==="code")return n.outerHTML;
    if(tag==="img")return "\n\n!["+ (n.getAttribute("alt")||"").replace(/[\[\]]/g,"")+"]("+n.getAttribute("src")+")\n\n";
    if(/^h[1-6]$/.test(tag))return "\n\n"+"#".repeat(Number(tag[1]))+" "+inner()+"\n\n";
    if(["b","strong"].includes(tag))return "**"+inner()+"**";
    if(["i","em"].includes(tag))return "*"+inner()+"*";
    if(tag==="a"&&n.getAttribute("href"))return "["+inner()+"]("+n.getAttribute("href")+")";
    if(tag==="br")return "  \n";
    if(tag==="li")return "\n"+(n.parentElement.localName==="ol"?"1. ":"- ")+inner();
    if(["p","div","ul","ol","figure"].includes(tag))return "\n\n"+inner()+"\n\n";
    if(tag==="blockquote")return "\n\n"+inner().trim().split("\n").map(l=>"> "+l).join("\n")+"\n\n";
    return inner();
  };
  return [...body.childNodes].map(render).join("").trim();
}

export async function saveCsdn(article,ctx){
 ctx.progress('打开 CSDN 编辑器（加载上限 20 秒）');
 const markdown=csdnMarkdown(article.html),tab=await pageTab(editor);
 const input={title:article.title,markdown,account:ctx.account.id};
 let submitted=false;
 try{
  ctx.progress('在 CSDN 编辑器中新建独立草稿');
  // Native editor may autosave after content changes: checkpoint before writing.
  await ctx.submitting();submitted=true;
  await ctx.checkpoint({url:editor,editorMode:true});
  const prepared=await inPage(tab,csdnEditorAction,['prepare',input]);
  ctx.progress('点击 CSDN 原生保存草稿');
  const saved=await inPage(tab,csdnEditorAction,['save',{...input,...prepared}]);
  const url=editor+'?articleId='+saved.draftId;
  await ctx.checkpoint({draftId:saved.draftId,url});
  ctx.progress('重新打开核对云端草稿');
  const verifyTab=await pageTab(url);
  try{await inPage(verifyTab,csdnEditorAction,['verify',{...input,draftId:saved.draftId}]);}
  finally{await window.workbench.closePlatformTab('csdn',verifyTab).catch(()=>{});}
  await window.workbench.closePlatformTab('csdn',tab).catch(()=>{});
  return {draftId:saved.draftId,url,note:'CSDN 原生编辑器草稿（已重新打开核对；图片展示请在编辑器检查）'};
 }catch(e){
  if(submitted){Object.assign(e,{needsAttention:true,platform:'csdn',verifyUrl:editor,editorTabId:tab});}
  else await window.workbench.closePlatformTab('csdn',tab).catch(()=>{});
  throw e;
 }
}
