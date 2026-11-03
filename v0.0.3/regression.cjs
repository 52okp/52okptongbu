const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const handlers = new Map();
const events = [];
const requests = [];
const locations = { userData: 'C:\\UserData' };
const createdViews=[];
class View {
  constructor(options) {
    this.options=options;this.urls=[];createdViews.push(this);
    this.webContents = {
      session: electron.session.fromPartition(), setWindowOpenHandler() {}, on() {},
      loadURL: url => {this.urls.push(url);return new Promise(() => {});},
      getTitle: () => '', getURL: () => '', isLoading: () => true
    };
  }
  setBounds() {}
}
const electron = {
  app: {isPackaged:true,getPath:k=>locations[k],setPath:(k,v)=>locations[k]=v,
    whenReady:()=>new Promise(()=>{}),on(){},getVersion:()=> '0.0.3'},
  WebContentsView: View, ipcMain:{handle:(k,fn)=>handlers.set(k,fn)},
  session:{fromPartition:()=>({fetch:async(url,options)=>{
    requests.push({url,options});return {status:200,statusText:'OK',ok:true,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(0)};
  }})},BrowserWindow:class {},Menu:{},dialog:{},shell:{},safeStorage:{}
};
const fakeFs = {...fs,readFileSync(){return JSON.stringify({dataPath:'D:\\SavedArticles'});},mkdirSync(){},writeFileSync(){},appendFileSync(){}};
const context = vm.createContext({require:id=>id==='electron'?electron:id==='node:fs'?fakeFs:require(id),
  __dirname:__dirname, process:{platform:'win32',execPath:'C:\\App\\app.exe',env:{},on(){}},
  console,setTimeout,clearTimeout,URL,URLSearchParams,FormData,Blob,AbortSignal,AbortController,Headers});
vm.runInContext(fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8'),context);
vm.runInContext('win={isDestroyed:()=>false,contentView:{addChildView(){},removeChildView(){}},webContents:{send:(name,value)=>events.push([name,value])}}',Object.assign(context,{events}));
(async()=>{
  assert.equal(locations.userData,path.resolve('D:\\SavedArticles'));
  await Promise.race([
    handlers.get('platform:open')(null,'csdn'),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Platform waited for network')),200))
  ]);
  await handlers.get('platform:open')(null,'zhihu');
  assert.deepEqual(events.filter(([name])=>name==='browser:active').map(([,key])=>key),['csdn','zhihu']);
  handlers.get('browser:hide')();
  assert.equal(events.at(-1)[1],null);
  assert.equal(handlers.get('settings:data:path')(),locations.userData);
  await handlers.get('platform:open')(null,'toutiao');
  const count=createdViews.length;
  const draftUrl='https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123';
  await handlers.get('platform:open')(null,'toutiao',draftUrl);
  assert.equal(createdViews.length,count);
  assert.equal(createdViews.at(-1).options.webPreferences.partition,'persist:article-sync-toutiao');
  assert.equal(createdViews.at(-1).urls.at(-1),draftUrl);
  // Test the actual renderer's generated result links, including each captured platform ID.
  const {platforms,byId}=await import('./lib/model.js');
  const rows=[],opened=[];
  function element(){return {style:{},dataset:{},removeAttribute(name){this[name]=undefined;},append(){}};}
  const renderer={platforms,byId,window:{workbench:{openPlatform:async(...args)=>opened.push(args)}},
    document:{getElementById:()=>({append:row=>rows.push(row)}),createElement:()=>{
      const nodes=new Map();return {...element(),querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{...element(),target:'_blank'});return nodes.get(selector);}};}}};
  const rendererSource=fs.readFileSync(path.join(__dirname,'workbench.js'),'utf8').split('const help=')[0].replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(rendererSource,renderer);
  for(const row of rows){
    const link=row.querySelector('.result');link.href=draftUrl;let prevented=false;
    link.onclick({preventDefault(){prevented=true;}});
    assert(prevented);assert.equal(link.target,undefined);
    assert.equal(opened.at(-1)[0],link.id.slice('result-'.length));
    assert.equal(opened.at(-1)[1],draftUrl);
  }
  assert.equal(opened.length,7);
  console.log('PASS: all seven draft links route via platform IPC; Toutiao draft reuses existing persistent view');
  const fetchPlatform=handlers.get('platform:fetch');
  const {serializeBody}=await import('./lib/request-body.js');
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,255]);
  const form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'sample.png');form.append('caption','图片');
  await fetchPlatform(null,'toutiao',{url:'https://mp.toutiao.com/spice/image',method:'POST',body:structuredClone(await serializeBody(form))});
  const uploaded=requests.at(-1).options.body.get('image');
  assert.equal(uploaded.name,'sample.png');assert.equal(uploaded.type,'image/png');
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()),bytes);
  assert.equal(requests.at(-1).options.body.get('caption'),'图片');
  const encoded=await serializeBody(new URLSearchParams({title:'中文 & 测试'}));
  await fetchPlatform(null,'toutiao',{url:'https://mp.toutiao.com/test',method:'POST',body:encoded});
  assert.equal(requests.at(-1).options.body.get('title'),'中文 & 测试');
  console.log('PASS: multipart image bytes, filename, MIME and text fields survive serialization and main-process reconstruction');
  for(const method of [undefined,'GET','get']) {
    await fetchPlatform(null,'toutiao',{url:'https://52okp.com/image.png',credentials:'omit',method,redirect:'error'});
    assert.equal(requests.at(-1).options.method,'GET');
    assert.equal(requests.at(-1).options.credentials,'omit');
    assert.equal(requests.at(-1).options.redirect,'error');
    assert.equal(requests.at(-1).options.headers.has('Origin'),false);
  }
  for(const spec of [
    {url:'https://52okp.com/image.png',credentials:'omit',method:'POST'},
    {url:'https://52okp.com/image.png',credentials:'include'},
    {url:'http://127.0.0.1/image.png',credentials:'omit'},
    {url:'file:///image.png',credentials:'omit'}
  ]) await assert.rejects(fetchPlatform(null,'toutiao',spec),/请求目标不在此平台的允许范围内/);
  console.log('PASS: external image GET defaults; no cookies or platform headers; POST, credentialed and local requests blocked');
  console.log('PASS: configured path preserved; switching does not await network; latest tab wins; workspace hides views');
})().catch(error=>{console.error(error);process.exitCode=1;});
