export const platforms = [
  {id:"csdn",name:"CSDN",badge:"C",color:"#e65b36",home:"https://mp.csdn.net/",editor:"https://editor.csdn.net/md/",note:"云端博客草稿箱"},
  {id:"weibo",name:"微博",badge:"微",color:"#e74a3b",home:"https://weibo.com/",editor:"https://card.weibo.com/article/v5/editor",note:"云端长文章草稿"},
  {id:"zhihu",name:"知乎",badge:"知",color:"#1769ff",home:"https://www.zhihu.com/",editor:"https://zhuanlan.zhihu.com/",note:"云端文章草稿"},
  {id:"xiaohongshu",name:"小红书",badge:"红",color:"#f04463",home:"https://creator.xiaohongshu.com/",editor:"https://creator.xiaohongshu.com/publish/publish?from=menu&target=article",note:"长文 · 当前浏览器本地草稿"},
  {id:"baijiahao",name:"百家号",badge:"百",color:"#2765da",home:"https://baijiahao.baidu.com/",editor:"https://baijiahao.baidu.com/builder/rc/edit",note:"云端图文草稿"},
  {id:"toutiao",name:"头条",badge:"头",color:"#ef4c46",home:"https://mp.toutiao.com/",editor:"https://mp.toutiao.com/profile_v4/graphic/publish",note:"云端文章草稿"},
  {id:"bilibili",name:"哔哩哔哩",badge:"哔",color:"#dc6094",home:"https://member.bilibili.com/",editor:"https://member.bilibili.com/platform/upload/text",note:"云端专栏草稿"}
];
export const byId = id => platforms.find(p=>p.id===id);
export function publicImageUrl(value) {
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) return value;
  const u = new URL(value), h = u.hostname.toLowerCase();
  if (!["https:","http:"].includes(u.protocol) || u.username || u.password ||
    h==="localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    !h.includes(".") || h.includes(":") ||
    /^(127|10|0|169\.254|192\.168)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new Error("图片地址不是可用的公网 HTTP(S) 地址");
  }
  return u.href;
}
export function validateArticle(article, platform) {
  if(platform==="weibo"&&[...(article.title||"")].length>32)throw new Error("微博长文章标题最多 32 字，请缩短标题");
  if (!article.title?.trim()) throw new Error("请填写文章标题");
  if (!article.html?.trim()) throw new Error("请填写正文");
  if (article.html.length > 6_000_000) throw new Error("正文过大，请控制在 6 MB 以内");
  if (["xiaohongshu","baijiahao"].includes(platform) && [...article.title].length>64) throw new Error("该平台标题最多 64 字，请缩短标题");
  if (platform==="xiaohongshu" && article.textLength>10000) throw new Error("小红书长文超过 10000 字，请缩短正文");
}
export function parseJsonResponse(text) {
  const trimmed = text.trim();
  const body = trimmed.match(/^[\w$.]+\(([\s\S]*)\);?$/)?.[1] || trimmed;
  try { const value=JSON.parse(body); if(!value || typeof value!=="object") throw new Error("Unexpected response"); return value; } catch { throw new Error("平台响应不是 JSON，可能需要登录或完成验证"); }
}
export function requireValue(value,message) {
  if (value===undefined || value===null || String(value)==="") throw new Error(message);
  return String(value);
}
export async function fingerprint(article, platform, account) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([platform,account,article.title,article.html])));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function canRetry(record) { return !record || record.phase==="failed" || (record.phase==="interrupted" && !record.submitted); }
