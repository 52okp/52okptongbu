import { pageTab, inPage, imageBlob, blobData } from "../lib/runtime.js";
import { transferImages, xhsDocument } from "../lib/content.js";
const editor="https://creator.xiaohongshu.com/publish/publish?from=menu&target=article";
export function localDraftRecord(id,uid,title,richJson) {
  const cover={width:0,height:0,fileid:"",frame:{ts:0,isUserSelect:false,isUpload:false},stickers:{version:2,neptune:[]},fonts:[]};
  return {draftId:id,uid,timeStamp:Date.now(),content:{
    contextStore:{
      liveContext:{time:0,title:""},
      previewAuditContext:{status:0,detail:{hasLimit:true,remainingCalls:0,taskId:"",taskType:"1",status:0,taskResultInfo:{detectionStatus:1,optimizationPoints:[]}},isChange:false},
      coverContext:{coverUrl:"",cover:{...cover,coverTemplateId:"",extra_info_json:""},templateBlob:null,rate:0,recommendCoverIdx:-1},
      goodsContext:{goodsInfo:{},goodsPreviewDetail:[]},bizRelationContext:{bizRelation:[]},recommendCovers:[]
    },
    draftStore:{title,desc:"",descInnerHTML:"",descLength:0,ats:[],hashTag:[],imgList:[],colorGroup:null,
      video:{width:0,height:0,fileid:"",fsize:0,duration:0,videoId:"",videoMarks:[],timelines:[],frame:{ts:0,userSelect:false},transcodeVideoFileId:"",coverInfo:{}},
      videoInfo:null,audioInfo:null,videoMeta:"",audioMeta:"",cover,chapters:[],markers:[],needTranscode:false},
    settingStore:{privacyInfo:{opType:1,type:0,userIds:[]},collectionId:"",orderId:"",brandAccountId:"",
      noteSketch:{id:"",name:""},original:false,originalDateStamp:"",coProduceBind:{enable:true},
      noteCopyBind:{copyable:true},coOrderId:"",interactionPermissionBind:{commentPermission:0},
      fileRelate:{fileId:"",docId:"",docName:"",docShowName:"",docType:"",docSize:0}},
    articleStore:{articleTitle:title,richJson,
      articleContent:JSON.stringify({metaInfo:{author_text:""}}),
      summeryContent:JSON.stringify({pic_title:title,pic_summary:""}),
      orderPattern:JSON.stringify({ol_prefix:"{}",subtitle_prefix:"{}"}),
      articleEditorMode:0,authorAndSummaryTemp:{author:"",summary:"",readingStats:""},selectedThemeId:6,
      selectedColorIndexMap:{},blob2Map:{},coverSetting:{styleType:0,showAuthor:true,showReadingStats:true,showSummery:true},
      editPageSource:"import",schemaCopy:{},url2FileIdMap:{}},
    shortDraftStore:{isShort:true,editStatus:0,textCardList:[{createTime:Date.now(),text:"",originText:"",length:0,image:"",imageFileId:"",isManualInsert:false}],coverList:[],currentCoverIdx:0,cacheData:{}},
    publishStore:{publishType:1,imageNoteOrigin:0,systemId:"web",step:0,uploadState:2,status:0,codec:"unknown"}
  }};
}
export async function saveXiaohongshu(article,ctx) {
  ctx.progress("打开小红书长文编辑器");
  const tab=await pageTab(editor);
  await ctx.checkpoint({tabId:tab,url:editor});
  // Wait for the site's own database initialization; never create or upgrade it.
  await inPage(tab,async()=>{
    try{
      const deadline=Date.now()+15000;
      while(Date.now()<deadline){
        if(location.origin!=="https://creator.xiaohongshu.com"||location.pathname!=="/publish/publish") throw new Error("请先登录小红书并打开长文编辑页");
        const databases=await indexedDB.databases();
        if(databases.some(db=>db.name==="draft-database-v1")) {
          const ready=await new Promise(resolve=>{
            const req=indexedDB.open("draft-database-v1");
            req.onupgradeneeded=()=>req.transaction.abort();
            req.onerror=()=>resolve(false);
            req.onsuccess=()=>{const db=req.result;const exists=db.objectStoreNames.contains("article-draft");db.close();resolve(exists);};
          });
          if(ready) return {ok:true,data:true};
        }
        await new Promise(r=>setTimeout(r,400));
      }
      throw new Error("小红书本地草稿库尚未初始化，请打开长文编辑器手动新建一次空白草稿，再重试");
    }catch(e){return {ok:false,error:e.message};}
  });
  const html=await transferImages(article.html,async url=>{
    const blob=await imageBlob(url), data=await blobData(blob);
    const bitmap=await createImageBitmap(blob), dimensions={width:bitmap.width,height:bitmap.height};bitmap.close();
    const uploaded=await inPage(tab,async(data,mime)=>{
      try{
        if(location.origin!=="https://creator.xiaohongshu.com"||location.pathname!=="/publish/publish") throw new Error("小红书编辑页已跳转");
        if(typeof window._webmsxyw!=="function") throw new Error("小红书页面签名环境未就绪，请刷新创作中心");
        const path="/api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=1&version=1&source=web";
        const signed=window._webmsxyw(path), headers={Accept:"application/json"};
        for(const key of ["X-s","X-t","X-s-common"]) if(signed?.[key]) headers[key]=signed[key];
        const response=await fetch(path,{credentials:"include",headers,signal:AbortSignal.timeout(25000)});
        const result=await response.json();
        const permit=result.data?.uploadTempPermits?.find(p=>p.uploadAddr==="ros-upload.xiaohongshu.com");
        if(!response.ok||!result.success||!permit?.fileIds?.[0]||!permit.token) throw new Error("未取得小红书图片上传凭证，请完成平台验证");
        const fileId=permit.fileIds[0];
        if(typeof fileId!=="string"||fileId.includes("..")||/[?#\\]/.test(fileId)) throw new Error("上传路径异常");
        const bytes=Uint8Array.from(atob(data.split(",")[1]),c=>c.charCodeAt(0));
        const up=await fetch("https://ros-upload.xiaohongshu.com/"+fileId,{method:"PUT",headers:{Authorization:permit.token,"Content-Type":mime,"x-cos-security-token":permit.token},body:new Blob([bytes],{type:mime}),signal:AbortSignal.timeout(25000)});
        if(!up.ok) throw new Error("小红书图片上传失败 HTTP "+up.status);
        return {ok:true,data:{url:up.headers.get("x-ros-preview-url")||"https://ros-preview.xhscdn.com/"+fileId,fileId}};
      }catch(e){return {ok:false,error:e.message};}
    },[data,blob.type]);
    return {url:uploaded.url,attrs:dimensions};
  },ctx.progress);
  const id=crypto.randomUUID(),record=localDraftRecord(id,ctx.account.id,article.title,xhsDocument(html));
  ctx.progress("写入小红书本地长文草稿");await ctx.submitting();
  await inPage(tab,async(record)=>{
    try{
      if(location.origin!=="https://creator.xiaohongshu.com"||location.pathname!=="/publish/publish") throw new Error("小红书编辑页已跳转");
      const auth=await (await fetch("/api/galaxy/user/info",{credentials:"include",signal:AbortSignal.timeout(20000)})).json();
      if(!auth.success||String(auth.data?.userId)!==record.uid) throw new Error("小红书登录账号已变化，请重新检测登录");
      await new Promise((resolve,reject)=>{
        const req=indexedDB.open("draft-database-v1");
        let db,tx,finished=false;
        const done=error=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();error?reject(error):resolve();};
        const timer=setTimeout(()=>{try{tx?.abort();}catch{}done(new Error("本地草稿保存超时，请检查草稿箱"));},10000);
        req.onupgradeneeded=()=>req.transaction.abort();
        req.onerror=()=>done(new Error("无法打开小红书本地草稿库"));
        req.onsuccess=()=>{
          db=req.result;if(finished){db.close();return;}
          try{
            tx=db.transaction("article-draft","readwrite");
            const store=tx.objectStore("article-draft");
            if(store.keyPath!=="draftId") {tx.abort();done(new Error("小红书草稿结构变化，已停止写入"));return;}
            store.add(record);
            tx.oncomplete=()=>done();
            tx.onerror=()=>done(new Error("本地草稿事务失败"));
            tx.onabort=()=>done(new Error("本地草稿写入已中止"));
          }catch(e){done(e);}
        };
      });
      return {ok:true,data:{draftId:record.draftId}};
    }catch(e){return {ok:false,error:e.message};}
  },[record]);
  return {draftId:id,url:editor,tabId:tab,note:"已写入当前浏览器的小红书本地草稿；刷新创作中心后，在草稿箱 → 长文笔记查看"};
}
