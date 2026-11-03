export async function normalizeImage(blob){
 if(!blob.size||blob.size>15*1024*1024)throw new Error('图片为空或超过 15 MB');
 const bytes=new Uint8Array(await blob.slice(0,16).arrayBuffer());
 const text=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
 const type=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)?'image/png'
  :bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg'
  :['GIF87a','GIF89a'].includes(text(0,6))?'image/gif'
  :bytes.length>=12&&text(0,4)==='RIFF'&&text(8,12)==='WEBP'?'image/webp':null;
 if(!type)throw new Error('下载内容未识别为 PNG/JPEG/GIF/WebP 图片，可能是防盗链页面、其他格式或损坏文件');
 return blob.type===type?blob:new Blob([blob],{type});
}
export function imageFilename(blob){const extension={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[blob.type];if(!extension)throw new Error('不支持的图片格式');return 'article-image.'+extension;}
export async function compatibleUploadImage(blob){
 if(blob.type!=='image/webp')return blob;
 const header=new Uint8Array(await blob.slice(0,21).arrayBuffer());
 if(String.fromCharCode(...header.slice(12,16))==='VP8X'&&(header[20]&2))throw new Error('该图片是动态 WebP，无法无损转换为静态 PNG，请改用 GIF 或静态图片');
 let bitmap,canvas;
 try{
  bitmap=await createImageBitmap(blob);
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw new Error('图片尺寸过大，转换上限为 4000 万像素');
  canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('图片转换组件不可用');
  ctx.drawImage(bitmap,0,0);
  const converted=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG 编码失败')),'image/png'));
  return await normalizeImage(converted);
 }catch(error){throw new Error('WebP 转换 PNG 失败：'+error.message);}
 finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
