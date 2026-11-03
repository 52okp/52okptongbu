import {checkCsdn} from "./csdn.js";
import {imageFilename,compatibleUploadImage} from '../lib/image-file.js';
import {checkWeibo} from "./weibo.js";
import {updateZhihuDraft} from "./zhihu-drafts.js";
import {uploadZhihuEmbedded} from "./zhihu-images.js";
import { json, request, postJson, postForm, imageBlob, pageTab, inPage } from "../lib/runtime.js";
import { transferImages } from "../lib/content.js";
import { requireValue } from "../lib/model.js";
export async function checkAuth(id) {
  let r, u;
  switch(id){
    case "csdn": return checkCsdn();
    case "weibo": return checkWeibo();
    case "zhihu":
      r=await json("https://www.zhihu.com/api/v4/me",{headers:{"x-requested-with":"fetch"}});
      if(r.id) return {id:String(r.id),name:r.name||"知乎用户"}; break;
    case "baijiahao":
      r=await json("https://baijiahao.baidu.com/builder/app/appinfo?_="+Date.now());u=r.data?.user;
      if((r.errno===0||r.errmsg==="success")&&u?.userid) return {id:String(u.userid),name:u.name||"百家号用户"};break;
    case "toutiao":
      r=await json("https://mp.toutiao.com/mp/agw/media/get_media_info");u=r.data?.user;
      if(u?.id) return {id:String(u.id),name:u.screen_name||"头条用户"};break;
    case "bilibili":
      r=await json("https://api.bilibili.com/x/web-interface/nav?build=0&mobi_app=web");u=r.data;
      if(r.code===0&&u?.isLogin&&u.mid) return {id:String(u.mid),name:u.uname||"B站用户"};break;
    case "xiaohongshu":
      r=await json("https://creator.xiaohongshu.com/api/galaxy/user/info");u=r.data;
      if(r.success&&u?.userId) return {id:String(u.userId),name:u.userName||"小红书用户"};break;
  }
  throw new Error("未检测到登录，请先登录该平台创作中心");
}
export async function saveZhihu(article,ctx) {
  const html=await transferImages(article.html,async url=>{
    // Platform URL-import endpoint performs the transfer.
    if(url.startsWith("data:")) return uploadZhihuEmbedded(url);
    const r=await postForm("https://zhuanlan.zhihu.com/api/uploaded_images",{url,source:"article"},{"x-requested-with":"fetch"});
    return {url:requireValue(r.src,r.msg||"知乎图片转存失败")};
  },ctx.progress);
  ctx.progress("创建知乎草稿");
  await ctx.submitting();
  const created=await postJson("https://zhuanlan.zhihu.com/api/articles/drafts",{title:article.title},"POST",{"x-requested-with":"fetch"});
  const id=requireValue(created.id,"知乎没有返回草稿 ID");
  const url="https://zhuanlan.zhihu.com/p/"+encodeURIComponent(id)+"/edit";
  await ctx.checkpoint({draftId:id,url});
  return updateZhihuDraft(id,article.title,html,ctx);
}
export async function saveBaijiahao(article,ctx) {
  const page=await (await request("https://baijiahao.baidu.com/builder/rc/edit")).text();
  const token=page.match(/window\.__BJH__INIT__AUTH__\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if(!token) throw new Error("未获取百家号编辑凭证，请重新登录创作中心");
  const html=await transferImages(article.html,async url=>{
    const form=new FormData();
    const blob=await compatibleUploadImage(await imageBlob(url));form.append("media",blob,imageFilename(blob));
    for(const [k,v] of Object.entries({type:"image",app_id:"1589639493090961",is_waterlog:"1",save_material:"1",no_compress:"0",is_events:"",article_type:"news"})) form.append(k,v);
    const r=await json("https://baijiahao.baidu.com/materialui/picture/uploadProxy",{method:"POST",headers:{token},body:form});
    if(r.errno!==0&&r.errmsg!=="success") throw new Error(`百家号图片上传失败：${r.errmsg||'未返回成功'}（code=${r.errno??'无'}，${blob.type}，${blob.size} 字节）`);
    return {url:requireValue(r.ret?.https_url||r.ret?.url,"百家号未返回图片地址").replace(/^\/\//,"https://")};
  },ctx.progress);
  ctx.progress("保存百家号草稿");await ctx.submitting();
  const r=await postForm("https://baijiahao.baidu.com/pcui/article/save?callback=bjhdraft",{
    type:"news",title:article.title,content:html,feed_cat:"1",len:String(html.length),
    activity_list:JSON.stringify([{id:408,is_checked:0}]),source_reprinted_allow:"0",abstract_from:"1",
    isBeautify:"false",usingImgFilter:"false",first_exclusive_publish_v2:"3",subtitle:"",bjhtopic_id:"",bjhtopic_info:""
  },{token});
  if(r.errno!==0&&r.errmsg!=="success") throw new Error(r.errmsg||"百家号保存失败");
  const id=requireValue(r.ret?.article_id,"百家号未返回草稿 ID");
  return {draftId:id,url:"https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id="+encodeURIComponent(id),note:"百家号云端草稿；发布前请设置封面"};
}
export async function saveBilibili(article,ctx) {
  const cookie=await chrome.cookies.get({url:"https://www.bilibili.com",name:"bili_jct"});
  if(!cookie?.value) throw new Error("未取得 B站 CSRF 凭证，请重新登录");
  const csrf=cookie.value;
  const html=await transferImages(article.html,async url=>{
    const blob=await compatibleUploadImage(await imageBlob(url));const form=new FormData();form.append("binary",blob,imageFilename(blob));form.append("csrf",csrf);
    const r=await json("https://api.bilibili.com/x/article/creative/article/upcover",{method:"POST",body:form});
    if(r.code!==0) throw new Error(`B站图片上传失败：${r.message||'未返回成功'}（code=${r.code??'无'}，${blob.type}，${blob.size} 字节）`);
    return {url:requireValue(r.data?.url,"B站未返回图片地址").replace(/^\/\//,"https://"),attrs:r.data?.size?{size:r.data.size}:{}};
  },ctx.progress);
  ctx.progress("保存 B站专栏草稿");await ctx.submitting();
  const r=await postForm("https://api.bilibili.com/x/article/creative/draft/addupdate",{tid:"4",title:article.title,content:html,csrf,save:"0",pgc_id:"0"});
  if(r.code!==0) throw new Error(r.message||"B站保存失败");
  const id=requireValue(r.data?.aid,"B站未返回草稿 ID");
  return {draftId:id,url:"https://member.bilibili.com/platform/upload/text/edit?aid="+encodeURIComponent(id),note:"B站专栏云端草稿"};
}
export function toutiaoBody(article,html,adType) {
  return new URLSearchParams({
    article_type:"0",pgc_id:"0",source:"29",title:article.title,content:html,save:"0",entrance:"",
    extra:JSON.stringify({content_source:100000000402,content_word_cnt:html.length,is_multi_title:0,sub_titles:[],gd_ext:{entrance:"",from_page:"publisher_mp",enter_from:"PC",device_platform:"mp",is_message:0}}),
    search_creation_info:JSON.stringify({searchTopOne:0,abstract:"",clue_id:""}),
    title_id:String(Date.now()),mp_editor_stat:"{}",is_refute_rumor:"0",timer_status:"0",timer_time:"",
    educluecard:"",draft_form_data:JSON.stringify({coverType:3}),pgc_feed_covers:"[]",article_ad_type:adType,
    is_fans_article:"0",govern_forward:"0",praise:"0",disable_praise:"0",tree_plan_article:"0",
    star_order_id:"",star_order_name:"",activity_tag:"0",trends_writing_tag:"0",claim_exclusive:"0"
  }).toString();
}
export async function saveToutiao(article,ctx) {
  const info=await json("https://mp.toutiao.com/mp/agw/article/new?article_type=0&format=json&compat=1&column_no=");
  const permission=info.data?.media_permissions?.can_toutiao_ad_select, ads=info.data?.media?.ads_permission;
  const adType=permission===false||ads===0?"2":permission===true||ads>0?"3":null;
  if(!adType) throw new Error("未能读取头条创作权限，请打开创作中心确认");
  let csrf;
  const html=await transferImages(article.html,async url=>{
    if(!csrf){
      const r=await request("https://mp.toutiao.com/ttwid/check/",{method:"HEAD",headers:{"x-secsdk-csrf-request":"1","x-secsdk-csrf-version":"1.2.22"}});
      csrf=r.headers.get("x-ware-csrf-token");
      if(!csrf) throw new Error("未获取头条图片上传凭证");
    }
    const blob=await imageBlob(url);
    const extension={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[blob.type];
    const form=new FormData();form.append("image",blob,"article-image."+extension);
    const r=await json("https://mp.toutiao.com/spice/image?upload_source=20020002&aid=1231&device_platform=web",{method:"POST",headers:{"x-secsdk-csrf-token":csrf},body:form});
    if(r.code!==0||!r.data?.image_uri) throw new Error(`头条图片上传失败：${r.message||'未返回图片地址'}（code=${r.code??'无'}，${blob.type}，${blob.size} 字节）`);
    return {url:requireValue(r.data.image_url,"头条未返回图片地址"),attrs:{web_uri:r.data.image_uri,img_width:r.data.image_width||0,img_height:r.data.image_height||0}};
  },ctx.progress);
  ctx.progress("打开头条编辑环境");
  const tab=await pageTab("https://mp.toutiao.com/profile_v4/graphic/publish");
  await ctx.checkpoint({tabId:tab});
  const body=toutiaoBody(article,html.replace(/<img\b([^>]*)>/gi,'<div class="pgc-img"><img$1><p class="pgc-img-caption"></p></div>'),adType);
  ctx.progress("保存头条草稿");await ctx.submitting();
  const r=await inPage(tab,async body=>{
    try{
      if(location.origin!=="https://mp.toutiao.com") throw new Error("编辑器域名已变化");
      const response=await fetch("/mp/agw/article/publish?source=mp&type=article&aid=1231",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,credentials:"include",signal:AbortSignal.timeout(25000)});
      if(!response.ok) throw new Error("头条请求失败 HTTP "+response.status);
      return {ok:true,data:await response.json()};
    }catch(e){return {ok:false,error:e.message};}
  },[body]);
  if(r.err_no!==0||(r.code!==undefined&&r.code!==0)) throw new Error(r.message||"头条保存失败");
  const id=requireValue(r.data?.pgc_id,"头条未返回草稿 ID");
  await chrome.tabs.remove(tab).catch(()=>{});
  return {draftId:id,url:"https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id="+encodeURIComponent(id),note:"头条云端草稿；发布前请设置封面"};
}
