import {saveCsdn,verifyCsdnDraft} from "../adapters/csdn.js";
import {saveWeibo} from "../adapters/weibo.js";
import {verifyZhihuDraft,draftDigest} from "../adapters/zhihu-drafts.js";
import { fingerprint, canRetry, validateArticle } from "./model.js";
import { withHeaders } from "./runtime.js";
import { checkAuth, saveZhihu, saveBaijiahao, saveBilibili, saveToutiao } from "../adapters/cloud.js";
import { saveXiaohongshu } from "../adapters/xiaohongshu.js";
const save={csdn:saveCsdn,weibo:saveWeibo,zhihu:saveZhihu,baijiahao:saveBaijiahao,bilibili:saveBilibili,toutiao:saveToutiao,xiaohongshu:saveXiaohongshu};
export async function runPlatform(id,article,progress,confirmChanged,confirmAction) {
  validateArticle(article,id);
  return withHeaders(id,async()=>{
    progress("检查登录状态");
    const account=await checkAuth(id);
    const key="job:"+await fingerprint(article,id,account.id);
    let record=(await chrome.storage.local.get(key))[key];
    if(record?.phase==="done") return {...record.result,reused:true};
    if(id==="zhihu"&&record?.draftId){
      progress("核对上次已创建的知乎草稿");
      const expected=record.expectedDigest||(!/<img\\b/i.test(article.html)?await draftDigest(article.title,article.html):null);
      if(!expected)throw new Error("上次已创建知乎草稿，旧版没有保存图片核对信息。请打开原草稿检查正文和图片，完整后在任务记录中点击“已核对完整，标记成功”，不要解锁重建");
      const result=await verifyZhihuDraft(record.draftId,expected);
      await chrome.storage.local.set({[key]:{...record,phase:"done",result,error:"",updated:Date.now()}});
      return {...result,reused:true};
    }
    if(id==="csdn"&&record?.draftId&&record.expectedDigest){
      progress("核对原 CSDN 草稿");
      const result=await verifyCsdnDraft(record.draftId,record.expectedDigest);
      await chrome.storage.local.set({[key]:{...record,phase:"done",result,error:"",updated:Date.now()}});
      return {...result,reused:true};
    }
    if(["csdn","weibo"].includes(id)&&record?.draftId)throw new Error("上次已经创建草稿，请打开原草稿核对完整后在任务记录标记成功，不会再次新建");
    if(record&&!canRetry(record)) {
      throw new Error("上次保存可能已提交，请先检查平台草稿箱。任务记录中可查看详情，确认未保存后再解锁重试。");
    }
    const previous=Object.entries(await chrome.storage.local.get(null)).find(([k,r])=>
      k.startsWith("job:")&&k!==key&&r.platform===id&&r.accountId===account.id&&r.title===article.title&&r.phase==="done");
    if(previous&&!(await confirmChanged?.(previous[1])))throw new Error("已有同名文章的成功记录，已停止新建。内容可能变化，请先检查原草稿。");
    if(confirmAction&&!(await confirmAction(id,account,article)))throw new Error("你已取消本次平台操作");
    let stage="准备同步";
    const report=text=>{stage=text;progress(text);};
    record={platform:id,accountName:account.name,accountId:account.id,title:article.title,phase:"running",submitted:false,updated:Date.now()};
    const persist=async patch=>{Object.assign(record,patch,{updated:Date.now()});await chrome.storage.local.set({[key]:record});};
    try{
      await persist({});
      const result=await save[id](article,{
        account,progress:report,
        checkpoint:patch=>persist(patch),
        submitting:()=>persist({phase:"submitting",submitted:true})
      });
      await persist({phase:"done",result});
      return result;
    }catch(e){
      e.message=stage+"："+e.message;
      e.submitted=record.submitted;
      e.draftUrl=record.url||record.result?.url;
      await persist({phase:record.submitted?"uncertain":"failed",error:e.message}).catch(()=>{});
      throw e;
    }
  });
}
export async function recoverInterrupted() {
  const state=await chrome.storage.local.get(null);
  for(const [key,value] of Object.entries(state)){
    if(key.startsWith("job:")&&["running","submitting"].includes(value.phase))
      await chrome.storage.local.set({[key]:{...value,phase:value.submitted?"uncertain":"interrupted",error:"上次工作台已关闭或刷新，请检查平台草稿箱",updated:Date.now()}});
  }
}
