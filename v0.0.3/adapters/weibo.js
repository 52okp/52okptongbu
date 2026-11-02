import {request,json,postForm,imageBlob} from "../lib/runtime.js";
import {transferImages} from "../lib/content.js";
import {requireValue} from "../lib/model.js";
export async function checkWeibo(){
  const html=await (await request("https://card.weibo.com/article/v5/editor")).text();
  const encoded=html.match(/config:\s*JSON\.parse\('((?:\\.|[^'\\])*)'\)/)?.[1];
  if(!encoded)throw new Error("微博长文章编辑器未登录或要求验证，请先打开创作中心");
  let config;try{config=JSON.parse(encoded.replace(/\\'/g,"'").replace(/\\\\/g,"\\"));}catch{throw new Error("微博编辑器账号信息解析失败，请刷新平台页面");}
  if(!/^\d+$/.test(String(config.uid||"")))throw new Error("微博未返回有效账号");
  return {id:String(config.uid),name:config.nick||String(config.uid)};
}
function reqId(uid){
  return (btoa(uid+"&"+Date.now()).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")+crypto.randomUUID().replace(/-/g,"")).slice(0,43);
}
async function api(action,uid,id,body){
  const rid=reqId(uid),params=new URLSearchParams({uid,_rid:rid});if(id)params.set("id",id);
  const result=await postForm("https://card.weibo.com/article/v5/aj/editor/draft/"+action+"?"+params,body,{accept:"application/json, text/plain, */*","SN-REQID":rid});
  if(String(result.code)!=="100000")throw new Error("微博："+(result.msg||"草稿接口未返回成功状态"));
  return result.data;
}
export function weiboDraftBody(id,article,html){
  return {id,title:article.title,subtitle:"",type:"",status:"0",publish_at:"",error_msg:"",error_code:"0",
    collection:"[]",free_content:"",content:html,cover:"",summary:"",writer:"",extra:"null",is_word:"0",
    is_markdown:"0",article_recommend:"[]",follow_to_read:"1",isreward:"1",
    pay_setting:'{"ispay":0,"isvclub":0}',source:"0",action:"1",content_type:"0",save:"1"};
}
export async function uploadWeiboImage(url){
  const blob=await imageBlob(url);
  const result=await json("https://picupload.weibo.com/interface/pic_upload.php?app=miniblog&s=json&p=1&data=1&url=&markpos=1&logo=0&nick=&file_source=4",{
    method:"POST",body:blob});
  const pid=requireValue(result.data?.pics?.pic_1?.pid,"微博图片上传失败或需要验证");
  if(!/^[A-Za-z0-9_-]+$/.test(pid))throw new Error("微博图片 ID 异常");
  return {url:"https://wx3.sinaimg.cn/large/"+pid+".jpg",attrs:{"data-pid":pid}};
}
export function weiboChallenge(result){
  const raw=result?.geetest?.verifyUrl;
  if(typeof raw!=="string"||!raw.trim())return null;
  let url=null;
  try{
    const parsed=new URL(raw.trim());
    if(parsed.protocol==="https:"&&parsed.hostname==="security.weibo.com"&&parsed.pathname.startsWith("/verify/")&&!parsed.username&&!parsed.password&&!parsed.port)url=parsed.href;
  }catch{}
  return {url};
}
export async function saveWeibo(article,ctx){
  let html=await transferImages(article.html,uploadWeiboImage,ctx.progress);
  const doc=new DOMParser().parseFromString(html,"text/html");
  for(const img of [...doc.images])if(!img.closest("figure")){
    const figure=doc.createElement("figure");figure.className="image";img.replaceWith(figure);figure.append(img);
  }
  html=doc.body.innerHTML;
  ctx.progress("创建微博长文章草稿");await ctx.submitting();
  const created=await api("create",ctx.account.id,null,{});
  const id=requireValue(created?.id,"微博未返回草稿 ID");
  if(!/^\d+$/.test(id))throw new Error("微博草稿 ID 无效");
  const url="https://card.weibo.com/article/v5/editor#/draft/"+id;
  await ctx.checkpoint({draftId:id,url});
  ctx.progress("保存微博长文章正文");
  const result=await api("save",ctx.account.id,id,weiboDraftBody(id,article,html));
  const challenge=weiboChallenge(result);
  if(challenge){
    const error=new Error("微博返回了安全验证地址，请完成验证并检查原草稿，不要重复新建");
    Object.assign(error,{platform:"weibo",needsAttention:true,verifyUrl:challenge.url||url,draftUrl:url,submitted:true});
    throw error;
  }
  return {draftId:id,url,note:"微博长文章草稿（发布前请在平台检查排版与封面）"};
}
