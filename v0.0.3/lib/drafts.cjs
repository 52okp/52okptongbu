const {randomUUID}=require('node:crypto');
function archiveEditor(data){const old=data.editor;if(old&&(old.title||old.body)&&!Object.entries(data).some(([k,v])=>k.startsWith('draft:')&&v.title===old.title&&v.body===old.body&&v.format===old.format)){data['draft:'+randomUUID()]={...old,updated:Date.now()};}}
function saveDraft(data,value,id){
 if(!value||typeof value.body!=='string'||typeof value.title!=='string'||!['html','markdown','text'].includes(value.format)||value.body.length>6000000)throw new Error('文章内容无效');
 if(id&&data.deletedDraftIds?.includes(id))throw new Error('这篇本地文章已删除。请点击“新建文章”后再保存，避免自动恢复已删除的文章。');
 archiveEditor(data);
 const key=typeof id==='string'&&id.startsWith('draft:')&&data[id]?id:'draft:'+randomUUID();
 data[key]={title:value.title,body:value.body,format:value.format,source:String(value.source||''),updated:Date.now()};data.editor={...data[key]};return key;
}
function deleteDraft(data,id){
 if(typeof id!=='string'||!(id==='editor'||id.startsWith('draft:')))throw new Error('本地文章标识无效');
 const value=data[id];if(!value)return false;
 if(data.editor&&data.editor.title===value.title&&data.editor.body===value.body&&data.editor.format===value.format)delete data.editor;
 delete data[id];
 if(id!=='editor')data.deletedDraftIds=[...new Set([...(data.deletedDraftIds||[]),id])];
 return true;
}
module.exports={archiveEditor,saveDraft,deleteDraft};
