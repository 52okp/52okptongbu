export const channels=[['toutiao','头条'],['baijiahao','百家号'],['csdn','CSDN'],['xiaohongshu','小红书'],['bilibili','哔哩哔哩'],['zhihu','知乎'],['weibo','微博'],['blog','博客']];
export function beijingNow(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,16);}
export function createPlan(title='',draftId=null){return {id:crypto.randomUUID(),title,draftId,created:Date.now(),exclusive:true,toutiaoTime:beijingNow(),notes:'',channels:Object.fromEntries(channels.map(([id])=>[id,{status:id==='blog'?'skip':'pending',scheduledAt:'',publishedAt:'',url:''}]))};}
export function timestamp(value){return value?Date.parse(value.length===16?value+':00+08:00':value):NaN;}
export function toutiaoTime(plan){return Object.hasOwn(plan,'toutiaoTime')?plan.toutiaoTime:(plan.channels.toutiao.publishedAt||plan.channels.toutiao.scheduledAt||'');}
export function unlockAt(plan){const start=timestamp(toutiaoTime(plan));return Number.isFinite(start)?start+72*3600000:null;}
export function summary(plan,now=Date.now()){
 const active=Object.entries(plan.channels).filter(([id,c])=>id!=='toutiao'&&c.status!=='skip').map(([,c])=>c);
 const done=active.filter(c=>c.status==='published').length,unlock=unlockAt(plan);
 const category=active.length&&done===active.length?'complete':!unlock?'unset':unlock>now?'waiting':'pending';
 return {total:active.length,done,unlock,category};
}
export function dateLabel(ms){return Number.isFinite(ms)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms):'待填写头条时间';}
