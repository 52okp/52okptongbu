const { contextBridge, ipcRenderer } = require('electron');
let currentPlatform = null;

async function serializeBody(body) {
  if (body == null) return undefined;
  if (body instanceof FormData) {
    const entries=[];
    for (const [name,value] of body.entries()) {
      if (value instanceof Blob) entries.push({name,value:{kind:'blob',type:value.type,filename:value.name||'upload.bin',bytes:new Uint8Array(await value.arrayBuffer())}});
      else entries.push({name,value:String(value)});
    }
    return {kind:'form-data',entries};
  }
  if (body instanceof URLSearchParams) return {kind:'url-search-params',value:[...body.entries()]};
  if (body instanceof Blob) return {kind:'bytes',bytes:new Uint8Array(await body.arrayBuffer())};
  if (body instanceof ArrayBuffer) return {kind:'bytes',bytes:new Uint8Array(body)};
  if (ArrayBuffer.isView(body)) return {kind:'bytes',bytes:new Uint8Array(body.buffer,body.byteOffset,body.byteLength)};
  return {kind:'text',value:String(body)};
}

contextBridge.exposeInMainWorld('workbench', {
  load: () => ipcRenderer.invoke('data:load'),
  showError: text => ipcRenderer.invoke('ui:error',text),
  openPlanner: () => ipcRenderer.invoke('planner:open'),
  saveDraft: (value,id) => ipcRenderer.invoke('drafts:save',value,id),
  takeDraft: () => ipcRenderer.invoke('drafts:take'),
  onPendingDraft: callback => ipcRenderer.on('drafts:pending',callback),
  putPlan: item => ipcRenderer.invoke('planner:put',item),
  listPlans: () => ipcRenderer.invoke('planner:list'),
  dataPath: () => ipcRenderer.invoke('settings:data:path'),
  chooseDataPath: () => ipcRenderer.invoke('settings:data:choose'),
  save: data => ipcRenderer.invoke('data:save', data),
  openFile: () => ipcRenderer.invoke('file:open'),
  exportHtml: html => ipcRenderer.invoke('file:export', html),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getCsdnCredentialStatus: () => ipcRenderer.invoke('settings:csdn:status'),
  saveCsdnCredentials: values => ipcRenderer.invoke('settings:csdn:save', values),
  clearCsdnCredentials: () => ipcRenderer.invoke('settings:csdn:clear'),
  signCsdnRequest: (method,path,contentType,nonce) => ipcRenderer.invoke('csdn:sign',{method,path,contentType,nonce}),
  listSites: () => ipcRenderer.invoke('sites:list'),
  addSite: site => ipcRenderer.invoke('sites:add', site),
  openPlatform: (key, url) => ipcRenderer.invoke('platform:open', key, url),
  setPlatformContext: key => { currentPlatform = key; return true; },
  platformFetch: async (key,url,options={}) => {
    const result=await ipcRenderer.invoke('platform:fetch',key,{url,method:options.method,headers:options.headers||[],body:options.body,credentials:options.credentials,redirect:options.redirect,timeoutMs:25000});
    return {status:result.status,statusText:result.statusText,ok:result.ok,headers:result.headers,body:result.body};
  },
  getPlatformCookie: (key, details) => ipcRenderer.invoke('platform:cookie', key, details),
  createPlatformTab: (key,url) => ipcRenderer.invoke('platform:tab:create',key,url),
  executePlatformPage: (key,id,source,args) => ipcRenderer.invoke('platform:tab:execute',key,id,source,args),
  closePlatformTab: (key,id) => ipcRenderer.invoke('platform:tab:close',key,id),
  showPlatformTab: (key,id) => ipcRenderer.invoke('platform:tab:show',key,id),
  storageGet: keys => ipcRenderer.invoke('storage:get',keys),
  storageSet: values => ipcRenderer.invoke('storage:set',values),
  storageRemove: keys => ipcRenderer.invoke('storage:remove',keys),
  browserBack: key => ipcRenderer.invoke('browser:back', key),
  browserForward: key => ipcRenderer.invoke('browser:forward', key),
  browserReload: key => ipcRenderer.invoke('browser:reload', key),
  browserNavigate: (key, address) => ipcRenderer.invoke('browser:navigate', key, address),
  browserBounds: bounds => ipcRenderer.invoke('browser:bounds', bounds),
  browserHide: () => ipcRenderer.invoke('browser:hide'),
  onBrowserState: callback => ipcRenderer.on('browser:state', (_event, state) => callback(state)),
  onBrowserActive: callback => ipcRenderer.on('browser:active', (_event, key) => callback(key)),
  onBrowserResize: callback => ipcRenderer.on('browser:resize', callback),
  onBrowserError: callback => ipcRenderer.on('browser:error', (_event, message) => callback(message)),
  onMenuAddSite: callback => ipcRenderer.on('menu:add-site', callback),
  onMenuWorkspace: callback => ipcRenderer.on('menu:workspace', callback),
  onMenuCsdnSettings: callback => ipcRenderer.on('menu:csdn-settings', callback),
  onUpdateProgress: callback => ipcRenderer.on('update:progress', (_event, value) => callback(value)),
  currentPlatform: () => currentPlatform
});
