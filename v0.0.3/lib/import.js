import {sanitize,escapeHtml} from "./content.js";
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const children=(node,name)=>[...(node?.children||[])].filter(n=>n.localName===name);
const child=(node,name)=>children(node,name)[0];
const attr=(node,name)=>node?.getAttributeNS(W,name)||node?.getAttribute("w:"+name)||"";
const val=node=>attr(node,"val");
const descendants=(node,name)=>[...(node?.getElementsByTagNameNS("*",name)||[])];
function xml(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("DOCX 含不支持的 XML 声明");
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length)throw new Error("DOCX 文档结构损坏");
  return doc;
}
export async function importDocx(buffer,filename){
  if(!globalThis.JSZip)throw new Error("DOCX 解析组件未加载，请重新加载扩展");
  let zip;
  try{zip=await JSZip.loadAsync(buffer);}catch{throw new Error("无法打开 DOCX，请确认文件未损坏、未加密，且不是旧版 .doc 文件");}
  const entries=Object.values(zip.files);
  if(entries.length>2500)throw new Error("DOCX 内容过多，最多支持 2500 个内部文件");
  let total=0;
  for(const file of entries){
    const size=file._data?.uncompressedSize||0;total+=size;
    if(size>16*1024*1024||total>40*1024*1024)throw new Error("DOCX 解压后过大，请压缩图片或拆分文档");
  }
  const read=async path=>zip.file(path)?xml(await zip.file(path).async("string")):null;
  const documentXml=await read("word/document.xml");
  if(!documentXml)throw new Error("文件不是有效的 Word DOCX 文档");
  const stylesXml=await read("word/styles.xml"),numberXml=await read("word/numbering.xml"),relsXml=await read("word/_rels/document.xml.rels");
  const styles=new Map(descendants(stylesXml,"style").map(n=>[attr(n,"styleId"),n]));
  const rels=new Map(descendants(relsXml,"Relationship").map(n=>[n.getAttribute("Id"),{target:n.getAttribute("Target"),external:n.getAttribute("TargetMode")==="External"}]));
  const warnings=new Set(), images=new Map();
  let imageBytes=0, title="";
  function styleChain(id){
    const result=[],seen=new Set();
    while(id&&!seen.has(id)&&result.length<12){seen.add(id);const style=styles.get(id);if(!style)break;result.push(style);id=val(child(style,"basedOn"));}
    return result;
  }
  function props(p){
    const direct=child(p,"pPr"),id=val(child(direct,"pStyle")),chain=styleChain(id);
    const list=child(direct,"numPr")||chain.map(s=>child(child(s,"pPr"),"numPr")).find(Boolean);
    const outline=child(direct,"outlineLvl")||chain.map(s=>child(child(s,"pPr"),"outlineLvl")).find(Boolean);
    const names=[id,...chain.flatMap(s=>[attr(s,"styleId"),val(child(s,"name"))])];
    let heading=outline?Number(val(outline))+1:0;
    if(!heading||heading>6){const name=names.find(s=>/^(heading|标题)\s*[1-6]$/i.test(s));heading=name?Number(name.match(/[1-6]/)[0]):0;}
    return {heading,title:names.some(n=>/^(title|标题)$/i.test(n)),list};
  }
  function listInfo(pr){
    if(!pr)return null;
    const id=val(child(pr,"numId"));if(!id||id==="0")return null;
    const level=Math.min(8,Number(val(child(pr,"ilvl")))||0);
    const num=descendants(numberXml,"num").find(n=>attr(n,"numId")===id);
    const abstractId=val(child(num,"abstractNumId"));
    const abstract=descendants(numberXml,"abstractNum").find(n=>attr(n,"abstractNumId")===abstractId);
    const override=children(num,"lvlOverride").find(n=>attr(n,"ilvl")===String(level));
    const lvl=child(override,"lvl")||children(abstract,"lvl").find(n=>attr(n,"ilvl")===String(level));
    const type=val(child(lvl,"numFmt"))==="bullet"?"ul":"ol";
    const start=Number(val(child(override,"startOverride"))||val(child(lvl,"start")))||1;
    return {id,level,type,start};
  }
  async function image(id){
    if(images.has(id))return images.get(id);
    const rel=rels.get(id);
    if(!rel||rel.external){warnings.add("外链图片未导入，请在正文中补充");return "";}
    const path=new URL(rel.target,"https://docx.invalid/word/document.xml").pathname.slice(1);
    if(!path.startsWith("word/media/")){warnings.add("不支持的图片引用已略过");return "";}
    const file=zip.file(path),ext=path.split(".").pop().toLowerCase();
    const mime={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp"}[ext];
    if(!file||!mime){warnings.add("部分图片格式不支持（仅保留 PNG、JPEG、GIF、WebP）");return "";}
    const bytes=await file.async("uint8array");imageBytes+=bytes.length;
    if(imageBytes>4*1024*1024)throw new Error("DOCX 内嵌图片合计超过 4 MB，请先压缩图片");
    const base64=await file.async("base64"),html='<img src="data:'+mime+';base64,'+base64+'" alt="">';
    images.set(id,html);return html;
  }
  async function inline(node){
    if(!node)return "";
    let out="";
    for(const n of node.children||[]){
      const name=n.localName;
      if(name==="t")out+=escapeHtml(n.textContent);
      else if(name==="tab")out+="　";
      else if(name==="br"||name==="cr")out+="<br>";
      else if(name==="blip")out+=await image(n.getAttributeNS(R,"embed")||n.getAttributeNS(R,"link"));
      else if(name==="imagedata")out+=await image(n.getAttributeNS(R,"id"));
      else if(name==="del"||name==="instrText"||name==="pPr"||name==="rPr")continue;
      else if(name==="oMath"||name==="oMathPara"){warnings.add("Word 公式已转为文字，需检查");out+=escapeHtml(n.textContent);}
      else if(name==="hyperlink"){
        const rel=rels.get(n.getAttributeNS(R,"id")),text=await inline(n);
        out+=rel?.external&&/^https?:\/\//i.test(rel.target)?'<a href="'+escapeHtml(rel.target)+'">'+text+"</a>":text;
      }else if(name==="r"){
        let text=await inline(n);const pr=child(n,"rPr");
        for(const [key,tag] of [["b","strong"],["i","em"],["u","u"],["strike","s"]]){
          const prop=child(pr,key);if(prop&&!["0","false","off","none"].includes(val(prop)))text="<"+tag+">"+text+"</"+tag+">";
        }
        const vertical=val(child(pr,"vertAlign"));if(["superscript","subscript"].includes(vertical)){const tag=vertical==="superscript"?"sup":"sub";text="<"+tag+">"+text+"</"+tag+">";}
        out+=text;
      }else out+=await inline(n);
    }
    return out;
  }
  async function blocks(container){
    let html="",stack=[];
    function close(){while(stack.length){const item=stack.pop();html+="</li></"+item.type+">";}}
    for(const n of container.children||[]){
      if(n.localName==="p"){
        const p=props(n),text=await inline(n),list=listInfo(p.list);
        if(p.title&&!title){
          title=descendants(n,"t").map(t=>t.textContent).join("").trim();
          if(container.localName==="body"&&!text.includes("<img"))continue;
        }
        if(list){
          // Keep nested levels and separate numbering definitions.
          if(stack.length&&stack[0].id!==list.id)close();
          const depth=Math.min(list.level,stack.length);
          while(stack.length>depth+1){const last=stack.pop();html+="</li></"+last.type+">";}
          if(stack.length===depth+1&&stack.at(-1).type!==list.type){const last=stack.pop();html+="</li></"+last.type+">";}
          if(stack.length===depth+1)html+="</li><li>";
          else {html+="<"+list.type+(list.type==="ol"&&list.start!==1?' start="'+list.start+'"':"")+"><li>";stack.push(list);}
          html+=text;
        }else{
          close();const tag=p.heading?"h"+p.heading:p.title?"h1":"p";
          html+="<"+tag+">"+(text||"<br>")+"</"+tag+">";
        }
      }else if(n.localName==="tbl"){
        close();html+="<table><tbody>";const rows=[];
        for(const row of children(n,"tr")){
          const cells=[];
          for(const cell of children(row,"tc")){
            const pr=child(cell,"tcPr"),span=Math.min(99,Number(val(child(pr,"gridSpan")))||1);
            if(child(pr,"vMerge"))warnings.add("纵向合并单元格已展开，请检查表格");
            cells.push("<td"+(span>1?' colspan="'+span+'"':"")+">"+await blocks(cell)+"</td>");
          }
          rows.push("<tr>"+cells.join("")+"</tr>");
        }
        html+=rows.join("")+"</tbody></table>";
      }else if(n.localName==="sdt"){
        close();const content=child(n,"sdtContent");if(content)html+=await blocks(content);
      }else if(["altChunk","drawing","object"].includes(n.localName))warnings.add("部分嵌入对象未导入，请检查正文");
    }
    close();return html;
  }
  const html=sanitize(await blocks(descendants(documentXml,"body")[0]));
  if(!html)throw new Error("DOCX 中没有可导入的正文");
  if(html.length>6_000_000)throw new Error("转换后的正文过大，请拆分文档或压缩图片");
  if(images.size)warnings.add("已保留内嵌图片；点击同步后会上传到所选平台");
  warnings.add("Word 页眉页脚、分页和浮动排版不保留；请检查预览");
  return {title:title||filename.replace(/\.docx$/i,""),body:html,format:"html",source:"",warnings:[...warnings]};
}
export async function readImportFile(file){
  const ext=file.name.split(".").pop().toLowerCase();
  if(ext==="doc")throw new Error("暂不支持旧版 .doc，请在 Word 中另存为 .docx");
  if(!["docx","md","txt","html","htm"].includes(ext))throw new Error("请选择 DOCX、Markdown、HTML 或 TXT 文件");
  if(file.size>(ext==="docx"?20*1024*1024:2_000_000))throw new Error(ext==="docx"?"DOCX 文件超过 20 MB，请压缩图片":"文本文件超过 2 MB");
  if(ext==="docx")return importDocx(await file.arrayBuffer(),file.name);
  return {title:file.name.replace(/\.[^.]+$/,""),body:await file.text(),format:ext==="md"?"markdown":["html","htm"].includes(ext)?"html":"text",source:"",warnings:[]};
}
