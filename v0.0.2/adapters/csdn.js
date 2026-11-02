import {json,imageBlob} from "../lib/runtime.js";
import {transferImages} from "../lib/content.js";
import {publicImageUrl,requireValue} from "../lib/model.js";
import {draftDigest} from "./zhihu-drafts.js";
export async function csdnHeaders(method,path,contentType="",nonce=crypto.randomUUID()){
  if(!window.workbench?.signCsdnRequest)throw new Error("CSDN 凭据签名仅在桌面工作台中可用");
  return window.workbench.signCsdnRequest(method,path,contentType,nonce);
}
export async function csdnApi(path,body,contentType="application/json; charset=UTF-8"){
  const method=body===undefined?"GET":"POST";
  if(!path.startsWith("/blog-console-api/")&&!path.startsWith("/resource-api/"))throw new Error("不支持的 CSDN 接口路径");
  const value=await json("https://bizapi.csdn.net"+path,{method,
    headers:await csdnHeaders(method,path,body===undefined?"":contentType),
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(Number(value.code)!==200)throw new Error("CSDN："+(value.message||value.msg||"接口未返回成功状态"));
  if(value.data===undefined||value.data===null)throw new Error("CSDN 接口缺少数据，请重新登录或检查验证");
  return value.data;
}
export async function checkCsdn(){
  const cookie=await chrome.cookies.get({url:"https://csdn.net",name:"UserName"});
  if(!cookie?.value)throw new Error("请先在同一浏览器登录 CSDN");
  await csdnApi("/blog-console-api/v3/editor/getBaseInfo");
  let name;try{name=decodeURIComponent(cookie.value);}catch{name=cookie.value;}
  return {id:name,name};
}
export function csdnDraftBody(article,html,markdown){
  return {id:"",title:article.title,content:html,markdowncontent:markdown,Description:"",
    categories:"",tags:"",type:"original",status:2,pubStatus:"draft",
    readType:"public",authorized_status:0,source:"pc_mdeditor"};
}
export function storageHost(value){
  const url=new URL(value);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
    ![".myhuaweicloud.com",".aliyuncs.com"].some(s=>url.hostname.endsWith(s)))throw new Error("CSDN 返回了不支持的图片存储域名，已停止上传");
  return url.href;
}
export async function uploadCsdnImage(url){
  const blob=await imageBlob(url);
  const suffix={"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp"}[blob.type];
  const grant=await csdnApi("/resource-api/v1/image/direct/upload/signature",{appName:"direct_blog",imageTemplate:"standard",imageSuffix:suffix},"application/json;charset=UTF-8");
  const host=storageHost(grant.host);
  for(const key of ["provider","accessId","policy","signature","callbackUrl","callbackBody","callbackBodyType","filePath"])if(typeof grant[key]!=="string"||!grant[key])throw new Error("CSDN 图片凭证缺少 "+key);
  if(!["oss","obs"].includes(grant.provider))throw new Error("CSDN 图片存储类型不支持");
  if(!await chrome.permissions.contains({origins:[new URL(host).origin+"/*"]}))throw new Error("未授予 CSDN 图片存储权限，请重新点击同步并允许图片转存");
  const form=new FormData();
  for(const [field,key] of Object.entries({key:"filePath",policy:"policy",signature:"signature",callbackBody:"callbackBody",callbackBodyType:"callbackBodyType"}))form.append(field,grant[key]);
  form.append(grant.provider==="obs"?"AccessKeyId":"OSSAccessKeyId",grant.accessId);
  form.append(grant.provider==="obs"?"callbackUrl":"callback",grant.callbackUrl);
  for(const [key,value] of Object.entries(grant.customParam||{}))form.append("x:"+key,String(value));
  form.append("file",blob,"article-image."+suffix);
  const result=await json(host,{method:"POST",credentials:"omit",redirect:"error",body:form});
  const output=publicImageUrl(requireValue(result.data?.imageUrl||result.imageUrl,"CSDN 未返回上传后的图片地址"));
  if(!new URL(output).hostname.endsWith(".csdnimg.cn"))throw new Error("CSDN 图片响应域名异常，请检查");
  return {url:output};
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
export async function verifyCsdnDraft(id,expectedDigest){
  if(!/^\d+$/.test(String(id)))throw new Error("CSDN 草稿 ID 无效");
  const data=await csdnApi("/blog-console-api/v3/editor/getArticle?id="+id);
  if(String(data.article_id??data.id??id)!==String(id))throw new Error("CSDN 返回的文章 ID 不一致");
  if(Number(data.status)!==2)throw new Error("CSDN 返回状态不是草稿（"+String(data.status)+"），请立即检查创作中心，插件不会重发");
  if(typeof data.title!=="string"||typeof data.content!=="string"||await draftDigest(data.title,data.content)!==expectedDigest)throw new Error("CSDN 草稿已创建，但标题、正文或图片尚未核对一致，请打开原草稿检查");
  return {draftId:String(id),url:"https://editor.csdn.net/md/?articleId="+id,note:"CSDN 草稿箱（已核对草稿状态和正文）"};
}
export async function saveCsdn(article,ctx){
  const html=await transferImages(article.html,uploadCsdnImage,ctx.progress);
  const expectedDigest=await draftDigest(article.title,html);
  const body=csdnDraftBody(article,html,csdnMarkdown(html));
  // Explicit invariant: this adapter creates new drafts only, never publishes or edits live articles.
  if(body.id!==""||body.status!==2||body.pubStatus!=="draft")throw new Error("CSDN 草稿参数异常，已停止");
  ctx.progress("保存 CSDN 草稿");await ctx.submitting();
  const data=await csdnApi("/blog-console-api/v3/mdeditor/saveArticle",body);
  const id=requireValue(data.id,"CSDN 未返回草稿 ID");
  if(!/^\d+$/.test(id))throw new Error("CSDN 返回了无效草稿 ID");
  await ctx.checkpoint({draftId:id,url:"https://editor.csdn.net/md/?articleId="+id,expectedDigest});
  ctx.progress("核对 CSDN 草稿状态和正文");
  return verifyCsdnDraft(id,expectedDigest);
}
