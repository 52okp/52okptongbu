import { publicImageUrl } from "./model.js";
const allowed = new Set("p div span h1 h2 h3 h4 h5 h6 br hr strong b em i u s del blockquote pre code ul ol li table thead tbody tr th td a img figure figcaption sub sup".split(" "));
export function sanitize(html, base="https://example.invalid/") {
  const doc = new DOMParser().parseFromString(html,"text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,svg,math,template,link,meta,base").forEach(n=>n.remove());
  for (const el of [...doc.body.querySelectorAll("*")]) {
    if (!allowed.has(el.localName)) { el.replaceWith(...el.childNodes); continue; }
    const attrs = Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]));
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
    if (el.localName==="img") {
      const src = attrs["data-src"] || attrs["data-original"] || attrs.src || "";
      try { el.setAttribute("src",publicImageUrl(new URL(src,base).href)); }
      catch { throw new Error("正文含无法读取的图片地址，请删除或替换该图片"); }
      if (attrs.alt) el.setAttribute("alt",attrs.alt);
    }
    if (el.localName==="a" && attrs.href) {
      try { const url=new URL(attrs.href,base); if (["https:","http:"].includes(url.protocol)) el.setAttribute("href",url.href); } catch {}
    }
    if (el.localName==="ol" && /^[1-9]\\d{0,5}$/.test(attrs.start||"")) el.setAttribute("start",attrs.start);
    if (el.localName==="code" && /^language-[\w-]+$/.test(attrs.class||"")) el.className=attrs.class;
    if (["td","th"].includes(el.localName)) for(const key of ["colspan","rowspan"]) if (/^[1-9]\d?$/.test(attrs[key]||"")) el.setAttribute(key,attrs[key]);
  }
  return doc.body.innerHTML.trim();
}
export const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function markdownToHtml(input) {
  let fence=false, code=[], list="", result=[];
  const closeList=()=>{if(list){result.push("</"+list+">");list="";}};
  const inline=s=>escapeHtml(s)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,'<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/\x60([^\x60]+)\x60/g,"<code>$1</code>");
  for (const line of input.replace(/\r\n/g,"\n").split("\n")) {
    if (/^\s*\x60{3}/.test(line)) {
      closeList(); if(fence){result.push("<pre><code>"+escapeHtml(code.join("\n"))+"</code></pre>");code=[];} fence=!fence; continue;
    }
    if(fence){code.push(line);continue;}
    const item = line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if(item){const type=item[1]?"ul":"ol";if(list!==type){closeList();list=type;result.push("<"+type+">");}result.push("<li>"+inline(item[2])+"</li>");continue;}
    closeList();
    const heading=line.match(/^(#{1,6})\s+(.+)$/);
    if(heading) result.push("<h"+heading[1].length+">"+inline(heading[2])+"</h"+heading[1].length+">");
    else if(/^>\s?/.test(line)) result.push("<blockquote>"+inline(line.replace(/^>\s?/,""))+"</blockquote>");
    else if(line.trim()) result.push("<p>"+inline(line)+"</p>");
  }
  closeList(); if(fence) result.push("<pre><code>"+escapeHtml(code.join("\n"))+"</code></pre>");
  return result.join("\n");
}
export function imageUrls(html) {
  const doc=new DOMParser().parseFromString(html,"text/html");
  return [...new Set([...doc.images].map(i=>i.getAttribute("src")).filter(Boolean))];
}
export async function transferImages(html, upload, progress) {
  const doc=new DOMParser().parseFromString(html,"text/html"), urls=imageUrls(html);
  for(let i=0;i<urls.length;i++){
    progress("转存图片 "+(i+1)+"/"+urls.length);
    const result=await upload(urls[i]), normalized=publicImageUrl(result.url);
    for(const img of doc.images) if(img.getAttribute("src")===urls[i]){
      img.setAttribute("src",normalized);
      for(const [k,v] of Object.entries(result.attrs||{})) if(/^(data-pid|width|height|size|web_uri|img_width|img_height|image_type|mime_type|ic-uri)$/.test(k)) img.setAttribute(k,String(v));
    }
  }
  return doc.body.innerHTML;
}
export function xhsDocument(html) {
  const body=new DOMParser().parseFromString(html,"text/html").body;
  const inline=(node,marks=[])=>{
    if(node.nodeType===3) return node.textContent?[{type:"text",text:node.textContent,...(marks.length?{marks}:{})}]:[];
    if(node.nodeType!==1) return [];
    if(node.localName==="br") return [{type:"hardBreak"}];
    const next=["strong","b"].includes(node.localName)?[{type:"highlight"}]:marks;
    return [...node.childNodes].flatMap(n=>inline(n,next));
  };
  const convert=node=>{
    if(node.nodeType===3) return node.textContent.trim()?[{type:"paragraph",content:[{type:"text",text:node.textContent}]}]:[];
    if(node.nodeType!==1) return [];
    if(node.localName==="img") return [{type:"image",attrs:{imgs:[{src:node.getAttribute("src"),desc:node.getAttribute("alt")||"",percent:30,width:410,height:Math.round(410*(Number(node.getAttribute("height"))||600)/(Number(node.getAttribute("width"))||800))}]}}];
    if(node.querySelector("img")) return [...node.childNodes].flatMap(convert);
    const tag=node.localName;
    if(["ul","ol"].includes(tag)) return [{type:tag==="ul"?"bulletList":"orderedList",...(tag==="ol"?{attrs:{start:1,type:null}}:{}),content:[...node.children].map(li=>({type:"listItem",content:[{type:"paragraph",content:inline(li)}]}))}];
    if(tag==="blockquote") return [{type:"blockquote",content:[{type:"paragraph",content:inline(node)}]}];
    if(["div","figure","table","thead","tbody","tr"].includes(tag)) return [...node.childNodes].flatMap(convert);
    const content=inline(node); if(!content.length) return [];
    return [{type:/^h[1-6]$/.test(tag)?"heading":"paragraph",...(/^h[1-6]$/.test(tag)?{attrs:{level:Math.min(3,Number(tag[1]))}}:{}),content}];
  };
  const content=[...body.childNodes].flatMap(convert);
  return {type:"doc",content:content.length?content:[{type:"paragraph"}]};
}
