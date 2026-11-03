const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=function({app,BrowserWindow,ipcMain,screen}){
 let window=null,queue=Promise.resolve();
 const file=()=>path.join(app.getPath('userData'),'publishing-plans.json');
 async function read(){try{return JSON.parse(await fs.readFile(file(),'utf8'));}catch(e){if(e.code==='ENOENT')return {items:[],bounds:null};throw e;}}
 function mutate(fn){const result=queue.catch(()=>{}).then(async()=>{const data=await read();await fn(data);await fs.mkdir(path.dirname(file()),{recursive:true});const temp=file()+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,file());return data;});queue=result;return result;}
 async function open(){
  if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();return;}
  const data=await read(),saved=data.bounds;
  const bounds=saved&&screen.getAllDisplays().some(d=>{const a=d.workArea;return saved.x<a.x+a.width&&saved.x+saved.width>a.x&&saved.y<a.y+a.height&&saved.y+saved.height>a.y;})?saved:{};
  window=new BrowserWindow({width:1200,height:850,...bounds,minWidth:960,minHeight:650,title:'发布计划',icon:path.join(__dirname,'assets/app.png'),webPreferences:{preload:path.join(__dirname,'planner-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',e=>e.preventDefault());
  window.on('close',()=>{try{const b=window.getNormalBounds();fsSyncBounds(b);}catch{}});
  function fsSyncBounds(b){require('node:fs').writeFileSync(path.join(app.getPath('userData'),'planner-window.json'),JSON.stringify({...b,maximized:window.isMaximized()}));}
  try{const b=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'planner-window.json'),'utf8'));if(screen.getAllDisplays().some(d=>{const a=d.workArea;return b.x<a.x+a.width&&b.x+b.width>a.x&&b.y<a.y+a.height&&b.y+b.height>a.y;}))window.setBounds({x:b.x,y:b.y,width:Math.max(960,b.width),height:Math.max(650,b.height)});if(b.maximized)window.maximize();}catch{}
  window.on('closed',()=>{window=null;});
  await window.loadFile(path.join(__dirname,'planner.html'));
 }
 let opening=null;
 ipcMain.handle('planner:open',()=>{if(!opening)opening=open().finally(()=>opening=null);return opening;});
 ipcMain.handle('planner:list',async()=>{await queue.catch(()=>{});return (await read()).items;});
 ipcMain.handle('planner:put',(_e,item)=>{
  if(!item||typeof item.id!=='string'||typeof item.title!=='string'||!item.title.trim()||item.title.length>200||!item.channels||JSON.stringify(item).length>100000)throw new Error('发布计划内容无效，请填写标题');
  return mutate(data=>{const i=data.items.findIndex(p=>p.id===item.id);item.updated=Date.now();if(i<0)data.items.unshift(item);else data.items[i]=item;}).then(()=>true);
 });
 ipcMain.handle('planner:delete',(_e,id)=>mutate(data=>{data.items=data.items.filter(p=>p.id!==id);}).then(()=>true));
 return {flush:()=>queue,prepareMigration:async()=>{if(window&&!window.isDestroyed()){window.close();if(window&&!window.isDestroyed())throw new Error('请先保存并关闭发布计划窗口，再更改数据目录。');}await queue;}};
};
