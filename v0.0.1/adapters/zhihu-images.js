import {imageBlob,json,postJson,request} from "../lib/runtime.js";
// MD5 is used only as the platform's image identifier, never for authentication.
export function md5(bytes){
  const length=bytes.length, padded=new Uint8Array(Math.ceil((length+9)/64)*64);
  padded.set(bytes);padded[length]=128;
  const view=new DataView(padded.buffer);view.setUint32(padded.length-8,(length*8)>>>0,true);view.setUint32(padded.length-4,Math.floor(length/0x20000000),true);
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  let state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
  for(let offset=0;offset<padded.length;offset+=64){
    let [a,b,c,d]=state;
    for(let i=0;i<64;i++){
      let f,g;
      if(i<16){f=(b&c)|(~b&d);g=i;}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}
      else if(i<48){f=b^c^d;g=(3*i+5)%16;}
      else{f=c^(b|~d);g=(7*i)%16;}
      const k=Math.floor(Math.abs(Math.sin(i+1))*0x100000000);
      const x=(a+f+k+view.getUint32(offset+g*4,true))|0,s=shifts[Math.floor(i/16)*4+i%4];
      [a,b,c,d]=[d,(b+((x<<s)|(x>>>(32-s))))|0,b,c];
    }
    state=state.map((n,i)=>(n+[a,b,c,d][i])>>>0);
  }
  return state.map(n=>[0,8,16,24].map(s=>((n>>>s)&255).toString(16).padStart(2,"0")).join("")).join("");
}
function safeKey(value){
  if(typeof value!=="string"||!value||value.length>512||!/^[a-zA-Z0-9_./-]+$/.test(value)||value.startsWith("/")||value.split("/").some(p=>p===".."||p==="."))throw new Error("知乎返回的图片路径无效");
  return value;
}
export async function ossHeaders(token,key,mime,date=new Date().toUTCString()){
  for(const name of ["access_id","access_key","access_token"])if(typeof token?.[name]!=="string"||!token[name]||/[\r\n]/.test(token[name]))throw new Error("知乎图片上传凭证不完整");
  safeKey(key);
  const headers={"x-oss-date":date,"x-oss-security-token":token.access_token,"x-oss-user-agent":"aliyun-sdk-js/6.8.0"};
  const canonical=Object.keys(headers).sort().map(k=>k+":"+headers[k]).join("\n");
  const text=["PUT","",mime,date,canonical,"/zhihu-pics/"+key].join("\n");
  const secret=await crypto.subtle.importKey("raw",new TextEncoder().encode(token.access_key),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",secret,new TextEncoder().encode(text));
  return {...headers,"Content-Type":mime,Authorization:"OSS "+token.access_id+":"+btoa(String.fromCharCode(...new Uint8Array(signature)))};
}
async function existingImage(id){
  if(!id)throw new Error("知乎未返回图片 ID");
  for(let i=0;i<10;i++){
    const result=await json("https://api.zhihu.com/images/"+encodeURIComponent(id),{headers:{"x-requested-with":"fetch"}});
    if(result.original_hash)return "https://pic4.zhimg.com/"+safeKey(result.original_hash);
    if(result.status==="failed")throw new Error("知乎图片处理失败，请更换图片");
    if(i<9)await new Promise(r=>setTimeout(r,1000));
  }
  throw new Error("知乎图片处理超时，请稍后重试");
}
export async function uploadZhihuEmbedded(url){
  const blob=await imageBlob(url),hash=md5(new Uint8Array(await blob.arrayBuffer()));
  const grant=await postJson("https://api.zhihu.com/images",{image_hash:hash,source:"article"},"POST",{"x-requested-with":"fetch"});
  const file=grant.upload_file;
  if(!file)throw new Error("知乎未返回图片上传信息，请检查登录或平台验证");
  if(file.state===1)return {url:await existingImage(file.image_id)};
  const key=safeKey(file.object_key),headers=await ossHeaders(grant.upload_token,key,blob.type);
  // Temporary credentials only go to this fixed Zhihu upload host.
  await request("https://zhihu-pics-upload.zhimg.com/"+key,{method:"PUT",headers,body:blob,credentials:"omit",redirect:"error"});
  return {url:"https://pic4.zhimg.com/"+key+(blob.type==="image/gif"&&!key.endsWith(".gif")?".gif":"")};
}
