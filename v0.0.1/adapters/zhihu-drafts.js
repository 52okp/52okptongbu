import {request,json} from "../lib/runtime.js";
export async function draftDigest(title,html){
  let normalized=html;
  if(typeof DOMParser!=="undefined"){
    const body=new DOMParser().parseFromString(html,"text/html").body;
    normalized=JSON.stringify({
      text:(body.textContent||"").replace(/\s+/g," ").trim(),
      images:[...body.querySelectorAll("img")].map(i=>i.getAttribute("src")||""),
      links:[...body.querySelectorAll("a[href]")].map(a=>a.getAttribute("href"))
    });
  }
  const value=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([title.trim(),normalized])));
  return [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function verifyZhihuDraft(id,expectedDigest){
  if(!/^[a-zA-Z0-9_-]+$/.test(String(id)))throw new Error("草稿 ID 无效");
  const value=await json("https://zhuanlan.zhihu.com/api/articles/"+encodeURIComponent(id)+"/draft",{headers:{"x-requested-with":"fetch"}});
  if(typeof value.title!=="string"||typeof value.content!=="string")throw new Error("读取到的知乎草稿缺少标题或正文，尚不能确认保存完整");
  if(await draftDigest(value.title,value.content)!==expectedDigest)throw new Error("知乎草稿已存在，但读取到的正文或图片与本次提交不一致。请打开原草稿核对，不要重复新建");
  return {draftId:String(id),url:"https://zhuanlan.zhihu.com/p/"+encodeURIComponent(id)+"/edit",note:"知乎云端草稿（已核对正文和图片地址）"};
}
export async function updateZhihuDraft(id,title,html,ctx){
  const expectedDigest=await draftDigest(title,html);
  await ctx.checkpoint({expectedDigest});
  ctx.progress("保存知乎草稿正文");
  // A successful PATCH may have an empty body (e.g. 204); do not parse it as JSON.
  await request("https://zhuanlan.zhihu.com/api/articles/"+encodeURIComponent(id)+"/draft",{
    method:"PATCH",headers:{"Content-Type":"application/json","x-requested-with":"fetch"},
    body:JSON.stringify({title,content:html})
  });
  ctx.progress("读取并核对知乎草稿");
  return verifyZhihuDraft(id,expectedDigest);
}
