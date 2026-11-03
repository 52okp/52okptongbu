import { parseJsonResponse, publicImageUrl } from "./model.js";
import { serializeBody } from './request-body.js';
import {normalizeImage} from './image-file.js';
let desktopPlatform=null;
function platformError(url,response,nonJson=false,text=""){
  const u=new URL(url),zhihu=u.hostname==="zhihu.com"||u.hostname.endsWith(".zhihu.com");
  const csdn=u.hostname==="bizapi.csdn.net";
  const html=/^\s*(?:<!doctype|<html|<head|<body)/i.test(text);
  const verification=[401,403].includes(response.status)||/登录|验证|captcha|sign.?in|unhuman/i.test(text.slice(0,4000));
  const gatewayHint=response.headers?.get("x-ca-error-message")||"";
  const signatureRejected=csdn&&/hmac|signature|x-ca-key|appkey|app key/i.test(gatewayHint+" "+text.slice(0,1500));
  const e=new Error((zhihu?"知乎":csdn?"CSDN":"平台")+(nonJson?(html?"返回了网页而非接口数据":"返回了无法解析的数据"):"请求失败 HTTP "+response.status)+
    "（"+u.pathname+"）"+(signatureRejected?"，网关拒绝了签名或应用配置，需要更新插件适配，不是简单的验证码问题":verification?"，请先在平台完成登录或验证":"，可能是接口变化或平台拦截"));
  if(zhihu){e.platform="zhihu";e.needsAttention=true;e.verificationLikely=verification;e.verifyUrl="https://www.zhihu.com/";}
  e.status=response.status;
  if(csdn)Object.assign(e,{platform:"csdn",needsAttention:true,signatureRejected,verifyUrl:"https://editor.csdn.net/md/"});
  return e;
}
export async function request(url, options={}) {
  const response = await networkFetch(url,{credentials:"include",...options,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw platformError(url,response,false,await response.text());
  return response;
}
async function networkFetch(url,options={}) {
  if(window.workbench?.platformFetch&&desktopPlatform){
    const value=await window.workbench.platformFetch(desktopPlatform,url,{
      method:options.method,headers:[...new Headers(options.headers||{}).entries()],
      body:await serializeBody(options.body),credentials:options.credentials,redirect:options.redirect
    });
    if(value instanceof Response)return value;
    let body=value.body;
    if([204,205,304].includes(value.status)||body?.byteLength===0)body=null;
    return new Response(body,{status:value.status,statusText:value.statusText,headers:value.headers});
  }
  return fetch(url,options);
}
export async function json(url, options={}) {
  const response=await request(url,options),text=await response.text();
  try{return parseJsonResponse(text);}catch{throw platformError(url,response,true,text);}
}
export const postJson = (url, body, method="POST", headers={}) => json(url,{method,headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
export const postForm = (url, body, headers={}) => json(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",...headers},body:new URLSearchParams(body)});
export async function imageBlob(url) {
  publicImageUrl(url);
  if(url.startsWith('data:image/')){
    const blob=await (await fetch(url)).blob();
    return normalizeImage(blob);
  }
  const response=await networkFetch(url,{method:"GET",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error("下载正文图片失败 HTTP "+response.status);
  const blob=await response.blob();
  return normalizeImage(blob);
}
export function blobData(blob) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("图片读取失败"));r.readAsDataURL(blob);}); }
export async function pageTab(url) {
  if(window.workbench?.createPlatformTab&&desktopPlatform)return window.workbench.createPlatformTab(desktopPlatform,url);
  // Dedicated tab: never overwrite another open editor.
  const tab=await chrome.tabs.create({url,active:false});
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    const current=await chrome.tabs.get(tab.id);
    if(current.status==="complete") {
      if(new URL(current.url).origin!==new URL(url).origin || /\/login(?:\/|$)/.test(new URL(current.url).pathname)) throw new Error("编辑器需要登录，请完成登录后重试");
      return tab.id;
    }
    await new Promise(r=>setTimeout(r,300));
  }
  throw new Error("编辑器加载超时，请打开平台检查");
}
export async function inPage(tabId,func,args=[]) {
  if(window.workbench?.executePlatformPage&&desktopPlatform){
    const value=await window.workbench.executePlatformPage(desktopPlatform,tabId,func.toString(),args);
    if(!value?.ok)throw new Error(value?.error||"页面操作未返回有效结果");
    return value.data;
  }
  const result=await chrome.scripting.executeScript({target:{tabId},world:"MAIN",func,args});
  const value=result[0]?.result;
  if(!value?.ok) throw new Error(value?.error||"页面操作未返回有效结果");
  return value.data;
}
export async function withHeaders(platform, fn) {
  if(window.workbench?.setPlatformContext){
    const previous=desktopPlatform;desktopPlatform=platform;
    await window.workbench.setPlatformContext(platform);
    try{return await fn();}finally{desktopPlatform=previous;await window.workbench.setPlatformContext(previous);}
  }
  const map={
    csdn:[["bizapi.csdn.net","https://editor.csdn.net","https://editor.csdn.net/md/"]],
    weibo:[["card.weibo.com","https://card.weibo.com","https://card.weibo.com/article/v5/editor"],["picupload.weibo.com","https://weibo.com"]],
    zhihu:[["zhuanlan.zhihu.com","https://zhuanlan.zhihu.com"],["www.zhihu.com","https://www.zhihu.com"],["api.zhihu.com","https://zhuanlan.zhihu.com"],["zhihu-pics-upload.zhimg.com","https://zhuanlan.zhihu.com"]],
    baijiahao:[["baijiahao.baidu.com","https://baijiahao.baidu.com"]],
    toutiao:[["mp.toutiao.com","https://mp.toutiao.com"]],
    bilibili:[["api.bilibili.com","https://member.bilibili.com"]],
    xiaohongshu:[["creator.xiaohongshu.com","https://creator.xiaohongshu.com"]]
  };
  const offset={csdn:60,weibo:70,zhihu:10,xiaohongshu:20,baijiahao:30,toutiao:40,bilibili:50}[platform];
  const rules=map[platform].map(([host,origin,referer],i)=>({id:offset+i,priority:1,
    action:{type:"modifyHeaders",requestHeaders:[{header:"Origin",operation:"set",value:origin},{header:"Referer",operation:"set",value:referer||origin+"/"}]},
    condition:{urlFilter:"||"+host+"/",initiatorDomains:[chrome.runtime.id],resourceTypes:["xmlhttprequest"]}}));
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:rules.map(r=>r.id),addRules:rules});
  try{return await fn();} finally {await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:rules.map(r=>r.id)});}
}
