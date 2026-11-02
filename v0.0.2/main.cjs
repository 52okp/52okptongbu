const { app, BrowserWindow, WebContentsView, ipcMain, dialog, Menu, shell, session, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { createReadStream } = require('node:fs');
const { createWriteStream } = require('node:fs');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const execFileAsync = promisify(execFile);
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/52okp/52okptongbu/main/update.json';
const bootstrapUserDataPath = app.getPath('userData');
const dataLocationConfigPath = path.join(bootstrapUserDataPath, 'launcher-settings.json');
let configuredDataPath = null;
try {
  const settings = JSON.parse(fsSync.readFileSync(dataLocationConfigPath, 'utf8'));
  if (typeof settings.dataPath === 'string' && path.isAbsolute(settings.dataPath)) {
    const savedPath = path.resolve(settings.dataPath);
    fsSync.mkdirSync(savedPath, { recursive: true });
    app.setPath('userData', savedPath);
    configuredDataPath = savedPath;
  }
} catch {}

function logStartupError(error) {
  try { fsSync.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} ${error?.stack || error}\n`); } catch {}
}
function logStartupStep(step) {
  if (!process.env.ARTICLE_SYNC_DEBUG) return;
  try { fsSync.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} ${step}\n`); } catch {}
}
logStartupStep('main module loaded');
process.on('uncaughtException', logStartupError);
process.on('unhandledRejection', logStartupError);

const platforms = {
  csdn: { name: 'CSDN', url: 'https://editor.csdn.net/md/' },
  weibo: { name: '微博', url: 'https://card.weibo.com/article/v5/editor' },
  zhihu: { name: '知乎', url: 'https://zhuanlan.zhihu.com/write' },
  xiaohongshu: { name: '小红书', url: 'https://creator.xiaohongshu.com/' },
  baijiahao: { name: '百家号', url: 'https://baijiahao.baidu.com/' },
  toutiao: { name: '头条', url: 'https://mp.toutiao.com/' },
  bilibili: { name: '哔哩哔哩', url: 'https://member.bilibili.com/' }
};
let win;
const views = new Map();
const platformSessions = new Map();
const temporaryTabs = new Map();
let customSites = [];
let activePlatform = null;
let viewBounds = { x: 230, y: 104, width: 1000, height: 700 };
fsSync.mkdirSync(path.join(app.getPath('userData'), 'browser-sessions'), { recursive: true });
app.setPath('sessionData', path.join(app.getPath('userData'), 'browser-sessions'));

async function flushPlatformSessions() {
  await Promise.all([...platformSessions.values()].map(session => Promise.all([
    session.cookies.flushStore(), session.flushStorageData()
  ])));
}
function pathIsSameOrNested(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
async function copyUserData(sourcePath, targetPath) {
  const names = ['workspace.json','task-storage.json','custom-sites.json','csdn-credentials.dat','browser-sessions','updates'];
  for (const name of names) {
    const source = path.join(sourcePath, name);
    if (!fsSync.existsSync(source)) continue;
    const destination = path.join(targetPath, name);
    const stat = await fs.stat(source);
    if (stat.isDirectory()) await fs.cp(source, destination, { recursive: true, force: true });
    else await fs.copyFile(source, destination);
  }
}
async function saveDataLocation(targetPath) {
  await fs.mkdir(bootstrapUserDataPath, { recursive: true });
  const temp = dataLocationConfigPath + '.tmp';
  await fs.writeFile(temp, JSON.stringify({ dataPath: targetPath }), 'utf8');
  await fs.rename(temp, dataLocationConfigPath);
}
async function chooseDataDirectory(firstRun = false) {
  const sourcePath = path.resolve(app.getPath('userData'));
  const pickerOptions = {
    title: firstRun ? '首次设置本地数据路径' : '更改本地数据路径',
    defaultPath: sourcePath,
    properties: ['openDirectory','createDirectory']
  };
  const result = win && !win.isDestroyed()
    ? await dialog.showOpenDialog(win, pickerOptions)
    : await dialog.showOpenDialog(pickerOptions);
  if (result.canceled || !result.filePaths[0]) return false;
  const targetPath = path.resolve(result.filePaths[0]);
  if (targetPath !== sourcePath && (pathIsSameOrNested(sourcePath, targetPath) || pathIsSameOrNested(targetPath, sourcePath))) {
    throw new Error('请选择与当前数据目录相互独立的位置，不能选它的子目录或父目录。');
  }
  await fs.mkdir(targetPath, { recursive: true });
  const names = await fs.readdir(targetPath);
  const dataNames = ['workspace.json','task-storage.json','custom-sites.json','csdn-credentials.dat','browser-sessions','updates'];
  const collisions = names.filter(name => dataNames.includes(name));
  if (targetPath !== sourcePath && collisions.length) {
    const options = { type: 'warning', title: '目标目录已有应用数据', message: '目标目录包含同名的文章或会话数据。继续会合并数据并覆盖目标中的同名应用文件。', detail: collisions.join('、'), buttons: ['继续迁移','取消'], defaultId: 1, cancelId: 1 };
    const answer = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (answer.response !== 0) return false;
  }
  if (targetPath !== sourcePath) {
    await flushPlatformSessions();
    await copyUserData(sourcePath, targetPath);
  }
  await saveDataLocation(targetPath);
  configuredDataPath = targetPath;
  if (targetPath !== sourcePath) {
    const options = { type: 'info', title: '数据路径已更改', message: '文章、任务和平台会话已复制到新位置。应用将重启以切换数据目录。', buttons: ['确定'] };
    if (win && !win.isDestroyed()) await dialog.showMessageBox(win, options); else await dialog.showMessageBox(options);
    app.relaunch();
    app.quit();
    return null;
  }
  return true;
}

function sendBrowserState(view, platform) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('browser:state', {
    platform,
    title: view.webContents.getTitle(),
    url: view.webContents.getURL(),
    loading: view.webContents.isLoading()
  });
}
function setBounds(bounds) {
  viewBounds = bounds;
  if (activePlatform) views.get(activePlatform)?.setBounds(viewBounds);
}
function hideViews() {
  for (const view of views.values()) win.contentView.removeChildView(view);
  activePlatform = null;
}
function showPlatform(key) {
  const view = views.get(key);
  if (!view) throw new Error('平台页面尚未创建');
  hideViews();
  activePlatform = key;
  win.contentView.addChildView(view);
  view.setBounds(viewBounds);
  win.webContents.send('browser:active', key);
  sendBrowserState(view, key);
}
function customSitesFile() { return path.join(app.getPath('userData'), 'custom-sites.json'); }
async function saveCustomSites() {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(customSitesFile(), JSON.stringify(customSites, null, 2), 'utf8');
}
function getSite(key) { return platforms[key] || customSites.find(site => site.key === key); }
function platformSession(key) {
  if (platformSessions.has(key)) return platformSessions.get(key);
  const ses = session.fromPartition(`persist:article-sync-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`);
  platformSessions.set(key, ses);
  return ses;
}
function hostIs(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
function allowedPlatformHost(key, host) {
  const maps = {
    csdn: ['bizapi.csdn.net','csdnimg.cn','myhuaweicloud.com','aliyuncs.com'],
    weibo: ['card.weibo.com','picupload.weibo.com','weibo.com','sinaimg.cn'],
    zhihu: ['www.zhihu.com','zhuanlan.zhihu.com','api.zhihu.com','zhihu-pics-upload.zhimg.com'],
    baijiahao: ['baijiahao.baidu.com'],
    toutiao: ['mp.toutiao.com'],
    bilibili: ['api.bilibili.com'],
    xiaohongshu: ['creator.xiaohongshu.com','ros-upload.xiaohongshu.com','ros-preview.xhscdn.com']
  };
  return (maps[key] || []).some(domain => hostIs(host, domain));
}
function pageHostAllowed(key, host) {
  const domains = {csdn:['csdn.net'],weibo:['weibo.com','sina.com.cn'],zhihu:['zhihu.com'],baijiahao:['baidu.com'],toutiao:['toutiao.com'],bilibili:['bilibili.com'],xiaohongshu:['xiaohongshu.com']};
  return (domains[key] || []).some(domain => hostIs(host, domain));
}
function defaultPlatformHeaders(key, host) {
  const settings = {
    csdn: {origin:'https://editor.csdn.net',referer:'https://editor.csdn.net/md/'},
    weibo: {origin:hostIs(host,'card.weibo.com')?'https://card.weibo.com':'https://weibo.com',referer:hostIs(host,'card.weibo.com')?'https://card.weibo.com/article/v5/editor':'https://weibo.com/'},
    zhihu: {origin:'https://zhuanlan.zhihu.com',referer:'https://zhuanlan.zhihu.com/'},
    baijiahao: {origin:'https://baijiahao.baidu.com',referer:'https://baijiahao.baidu.com/'},
    toutiao: {origin:'https://mp.toutiao.com',referer:'https://mp.toutiao.com/'},
    bilibili: {origin:'https://member.bilibili.com',referer:'https://member.bilibili.com/'},
    xiaohongshu: {origin:'https://creator.xiaohongshu.com',referer:'https://creator.xiaohongshu.com/'}
  };
  return settings[key] || {};
}
function parseVersion(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}
function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
async function getUpdateManifest() {
  const response = await session.defaultSession.fetch(UPDATE_MANIFEST_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub 更新信息请求失败（HTTP ${response.status}）`);
  const manifest = await response.json();
  if (manifest.app !== 'ArticleSyncWorkbench' || !parseVersion(manifest.version)) throw new Error('GitHub 更新清单格式无效');
  const platformKey = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : null;
  if (!platformKey) throw new Error('当前系统暂不支持自动更新');
  const update = manifest.platforms?.[platformKey] || (platformKey === 'windows' && manifest.downloadUrl ? manifest : null);
  if (!update || !/^[a-f0-9]{64}$/i.test(update.sha256 || '')) throw new Error(`GitHub 尚未发布 ${platformKey} 更新包`);
  const assetUrl = new URL(update.downloadUrl);
  const releaseUrl = new URL(manifest.releaseUrl);
  const expectedName = platformKey === 'windows'
    ? `ArticleSyncWorkbench-${manifest.version}-Windows-x64.zip`
    : `ArticleSyncWorkbench-${manifest.version}-macOS-x64.zip`;
  const expectedAsset = `/52okp/52okptongbu/releases/download/v${manifest.version}/${expectedName}`;
  if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== 'github.com' || decodeURIComponent(assetUrl.pathname) !== expectedAsset) throw new Error('更新下载地址不是指定的 GitHub Release');
  if (releaseUrl.protocol !== 'https:' || releaseUrl.hostname !== 'github.com' || releaseUrl.pathname !== '/52okp/52okptongbu/releases/tag/v' + manifest.version) throw new Error('更新页面地址无效');
  return { ...manifest, update, platformKey };
}
function psLiteral(value) { return `'${String(value).replace(/'/g, "''")}'`; }
async function findMacAppBundle(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) return fullPath;
    if (entry.isDirectory()) { const nested = await findMacAppBundle(fullPath); if (nested) return nested; }
  }
  return null;
}
function csdnCredentialsPath() { return path.join(app.getPath('userData'), 'csdn-credentials.dat'); }
function loadCsdnCredentials() {
  const file = csdnCredentialsPath();
  if (!fsSync.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储暂不可用，无法读取 CSDN 凭据');
  const stored = JSON.parse(fsSync.readFileSync(file, 'utf8'));
  const decoded = JSON.parse(safeStorage.decryptString(Buffer.from(stored.ciphertext, 'base64')));
  if (!decoded.appKey || !decoded.secret) throw new Error('本机 CSDN 凭据文件无效，请重新设置');
  return decoded;
}
function publicImageHost(host) {
  return host.includes('.') && !host.includes(':') && !/^(localhost|.*\.localhost|.*\.local|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1050, minHeight: 720,
    title: `文章同步工作台 ${app.getVersion()}`,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'desktop.html')).catch(logStartupError);
  win.webContents.on('did-fail-load', (_event, code, description, url) => logStartupError(`${description} (${code}): ${url}`));
  win.webContents.on('render-process-gone', (_event, details) => logStartupError(`Workbench renderer crashed: ${JSON.stringify(details)}`));
  win.on('resize', () => win.webContents.send('browser:resize'));
  win.on('closed', () => { win = null; views.clear(); });
  const menu = Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '文章工作台', click: () => win?.webContents.send('menu:workspace') },
      { label: '添加网站…', accelerator: 'Ctrl+Shift+N', click: () => win?.webContents.send('menu:add-site') },
      { type: 'separator' },
      { label: '退出', role: 'quit' }
    ] },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' },
      { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' },
      { label: '删除', role: 'delete' }, { type: 'separator' }, { label: '全选', role: 'selectAll' }
    ] },
    { label: '视图', submenu: [
      { label: '重新加载', role: 'reload', accelerator: 'Ctrl+R' },
      { label: '强制重新加载', role: 'forceReload', accelerator: 'Ctrl+Shift+R' },
      { type: 'separator' }, { label: '放大', role: 'zoomIn', accelerator: 'Ctrl+=' },
      { label: '缩小', role: 'zoomOut', accelerator: 'Ctrl+-' }, { label: '实际大小', role: 'resetZoom', accelerator: 'Ctrl+0' },
      { type: 'separator' }, { label: '切换全屏', role: 'togglefullscreen' }
    ] },
    { label: '设置', submenu: [
      { label: '打开本地数据文件夹', click: () => shell.openPath(app.getPath('userData')) },
      { label: '更改本地数据路径…', click: () => chooseDataDirectory(false).catch(error => dialog.showErrorBox('更改数据路径失败', error.message || String(error))) },
      { label: 'CSDN 凭据…', click: () => win?.webContents.send('menu:csdn-settings') },
      { label: '登录会话保存在本机', enabled: false },
      { label: '退出时保存网站数据', enabled: false }
    ] },
    { label: '窗口', submenu: [
      { label: '最小化', role: 'minimize' }, { label: '关闭窗口', role: 'close' }
    ] },
    { label: '帮助', submenu: [
      { label: '关于文章同步工作台', click: () => dialog.showMessageBox(win, { type: 'info', title: '关于', message: '文章同步工作台', detail: 'Windows 桌面测试版 0.0.1\n本版本通过内嵌 Chromium 打开网站，登录数据保存在本机。' }) }
    ] }
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  logStartupStep('app ready');
  if (!configuredDataPath) {
    try {
      const selected = await chooseDataDirectory(true);
      if (selected === null) return;
      if (!selected) {
        await dialog.showMessageBox({ type: 'info', title: '需要选择本地数据路径', message: '首次使用必须选择一个本地数据文件夹。', buttons: ['退出'] });
        app.quit();
        return;
      }
    } catch (error) {
      await dialog.showErrorBox('本地数据路径设置失败', error.message || String(error));
      app.quit();
      return;
    }
  }
  // Each platform uses its own persistent Chromium partition beneath sessionData.
  try { customSites = JSON.parse(fsSync.readFileSync(customSitesFile(), 'utf8')); } catch { customSites = []; }
  createWindow();
  logStartupStep('window created');
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}).catch(logStartupError);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let flushingSessions = false;
app.on('before-quit', event => {
  if (flushingSessions) return;
  event.preventDefault();
  Promise.all([...platformSessions.values()].map(session => Promise.all([
    session.cookies.flushStore(),
    session.flushStorageData()
  ]))).finally(() => { flushingSessions = true; app.quit(); });
});

ipcMain.handle('data:load', async () => {
  try { return JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'workspace.json'), 'utf8')); }
  catch { return { title: '', body: '', format: 'markdown', history: [] }; }
});
ipcMain.handle('data:save', async (_event, data) => {
  const file = path.join(app.getPath('userData'), 'workspace.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data), 'utf8');
  return true;
});
let storageWriteQueue = Promise.resolve();
const storageFile = () => path.join(app.getPath('userData'), 'task-storage.json');
async function readTaskStorage() {
  try { return JSON.parse(await fs.readFile(storageFile(), 'utf8')); } catch { return {}; }
}
ipcMain.handle('storage:get', async (_event, keys) => {
  const data = await readTaskStorage();
  if (keys == null) return data;
  if (typeof keys === 'string') return Object.hasOwn(data, keys) ? { [keys]: data[keys] } : {};
  if (Array.isArray(keys)) return Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
  if (typeof keys === 'object') return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, Object.hasOwn(data, key) ? data[key] : fallback]));
  return {};
});
ipcMain.handle('storage:set', (_event, values) => {
  storageWriteQueue = storageWriteQueue.then(async () => {
    const data = await readTaskStorage();
    Object.assign(data, values);
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(storageFile(), JSON.stringify(data), 'utf8');
  });
  return storageWriteQueue.then(() => true);
});
ipcMain.handle('storage:remove', (_event, keys) => {
  storageWriteQueue = storageWriteQueue.then(async () => {
    const data = await readTaskStorage();
    for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    await fs.writeFile(storageFile(), JSON.stringify(data), 'utf8');
  });
  return storageWriteQueue.then(() => true);
});
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '文章文件', extensions: ['md','txt','html','htm'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  return { name: path.basename(result.filePaths[0]), text: await fs.readFile(result.filePaths[0], 'utf8') };
});
ipcMain.handle('file:export', async (_event, html) => {
  const result = await dialog.showSaveDialog({ defaultPath: '文章备份.html', filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, html, 'utf8');
  return !result.canceled;
});
ipcMain.handle('update:check', async () => {
  const manifest = await getUpdateManifest();
  return {
    currentVersion: app.getVersion(),
    latestVersion: manifest.version,
    available: isNewerVersion(manifest.version, app.getVersion()),
    platform: manifest.platformKey,
    releaseUrl: manifest.releaseUrl,
    notes: String(manifest.notes || '').slice(0, 4000)
  };
});
ipcMain.handle('update:install', async () => {
  if (!app.isPackaged) throw new Error('当前从源码运行，无法替换程序。请在已安装版本中使用检查更新。');
  const manifest = await getUpdateManifest();
  if (!isNewerVersion(manifest.version, app.getVersion())) return { upToDate: true, version: app.getVersion() };
  if (!['win32','darwin'].includes(process.platform)) throw new Error('当前系统暂不支持自动安装更新');
  const root = path.join(app.getPath('userData'), 'updates', manifest.version, Date.now().toString());
  const zipPath = path.join(root, 'update.zip');
  const appPath = path.join(root, 'app');
  await fs.mkdir(root, { recursive: true });
  const response = await session.defaultSession.fetch(manifest.update.downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`下载更新包失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get('content-length')) || 0;
  let received = 0;
  const progress = new Transform({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    if (win && !win.isDestroyed()) win.webContents.send('update:progress', { received, total });
    callback(null, chunk);
  }});
  await pipeline(require('node:stream').Readable.fromWeb(response.body), progress, createWriteStream(zipPath));
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== manifest.update.sha256.toLowerCase()) {
    await fs.rm(zipPath, { force: true });
    throw new Error('更新包 SHA-256 校验失败，已删除下载文件');
  }
  await fs.mkdir(appPath, { recursive: true });
  let executable, launchArgs=[];
  if (process.platform === 'win32') {
    const command = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${psLiteral(zipPath)} -DestinationPath ${psLiteral(appPath)} -Force`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, timeout: 10 * 60 * 1000 });
    executable = path.join(appPath, 'ArticleSyncWorkbench.exe');
    if (!fsSync.existsSync(executable)) throw new Error('更新包结构无效：缺少 ArticleSyncWorkbench.exe');
  } else {
    await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, appPath], { timeout: 10 * 60 * 1000 });
    executable = await findMacAppBundle(appPath);
    if (!executable) throw new Error('更新包结构无效：缺少 macOS .app');
    launchArgs = ['-n', executable];
    executable = '/usr/bin/open';
  }
  await new Promise((resolve, reject) => {
    const child = spawn(executable, launchArgs, { cwd: appPath, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  setTimeout(() => app.quit(), 500);
  return { installed: true, version: manifest.version };
});
ipcMain.handle('settings:csdn:status', () => ({ configured: fsSync.existsSync(csdnCredentialsPath()), encrypted: true }));
ipcMain.handle('settings:csdn:save', async (_event, input) => {
  const appKey = String(input?.appKey || '').trim();
  const secret = String(input?.secret || '').trim();
  if (!/^[\w-]{4,80}$/.test(appKey)) throw new Error('CSDN App Key 格式无效');
  if (secret.length < 16 || secret.length > 256) throw new Error('CSDN Secret 长度无效');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储不可用，未保存凭据');
  const ciphertext = safeStorage.encryptString(JSON.stringify({ appKey, secret })).toString('base64');
  const target = csdnCredentialsPath(), temporary = target + '.tmp';
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify({ ciphertext }), 'utf8');
  await fs.rename(temporary, target);
  return { configured: true, encrypted: true };
});
ipcMain.handle('settings:csdn:clear', async () => {
  await fs.rm(csdnCredentialsPath(), { force: true });
  return { configured: false, encrypted: true };
});
ipcMain.handle('csdn:sign', (_event, input) => {
  const credentials = loadCsdnCredentials();
  if (!credentials) throw new Error('请先在“设置 → CSDN 凭据”中填写本机 App Key 和 Secret');
  const method = String(input?.method || 'GET').toUpperCase();
  const pathValue = String(input?.path || '');
  const contentType = String(input?.contentType || '');
  const nonce = String(input?.nonce || '');
  if (!pathValue.startsWith('/blog-console-api/') && !pathValue.startsWith('/resource-api/')) throw new Error('不支持的 CSDN 接口路径');
  if (!/^[0-9a-f-]{36}$/i.test(nonce)) throw new Error('CSDN 请求随机数无效');
  const canonical = [method, '*/*', '', contentType, '', `x-ca-key:${credentials.appKey}`, `x-ca-nonce:${nonce}`, pathValue].join('\n');
  const signature = crypto.createHmac('sha256', credentials.secret).update(canonical).digest('base64');
  return { Accept: '*/*', 'X-Ca-Key': credentials.appKey, 'X-Ca-Nonce': nonce, 'X-Ca-Timestamp': String(Date.now()), 'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce', 'X-Ca-Signature': signature, ...(contentType ? { 'Content-Type': contentType } : {}) };
});
ipcMain.handle('sites:list', () => customSites);
ipcMain.handle('sites:add', async (_event, input) => {
  const name = String(input?.name || '').trim().slice(0, 30);
  const rawUrl = String(input?.url || '').trim();
  if (!name) throw new Error('请填写网站名称');
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('网址格式无效'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('目前只支持不含账号信息的 HTTPS 网址');
  const id = crypto.randomUUID();
  const site = { id, key: `custom-${id}`, name, url: url.href };
  customSites.push(site);
  await saveCustomSites();
  return site;
});
ipcMain.handle('platform:open', async (_event, key, urlOverride) => {
  const platform = getSite(key);
  if (!platform) throw new Error('找不到这个网站，请重新添加');
  let targetUrl = urlOverride || platform.url;
  const parsedTarget = new URL(targetUrl);
  if (parsedTarget.protocol !== 'https:' || (!customSites.some(site => site.key === key) && !pageHostAllowed(key, parsedTarget.hostname))) throw new Error('平台页面地址无效');
  let view = views.get(key);
  if (!view) {
    view = new WebContentsView({ webPreferences: {
      partition: `persist:article-sync-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }});
    views.set(key, view);
    platformSessions.set(key, view.webContents.session);
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) { view.webContents.loadURL(url); return { action: 'deny' }; }
      return { action: 'deny' };
    });
    view.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) {
      view.webContents.on(event, () => sendBrowserState(view, key));
    }
    view.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) win?.webContents.send('browser:error', `${platform.name} 页面加载失败：${description}（${url}）`);
    });
    view.webContents.on('render-process-gone', () => win?.webContents.send('browser:error', '平台页面意外关闭，请重新打开此标签。'));
    view.webContents.on('context-menu', (_event, params) => {
      Menu.buildFromTemplate([
        { label: '后退', enabled: view.webContents.navigationHistory.canGoBack(), click: () => view.webContents.navigationHistory.goBack() },
        { label: '前进', enabled: view.webContents.navigationHistory.canGoForward(), click: () => view.webContents.navigationHistory.goForward() },
        { label: '重新加载', click: () => view.webContents.reload() },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: params.isEditable },
        { label: '复制', role: 'copy', enabled: params.selectionText.length > 0 || params.isEditable },
        { label: '粘贴', role: 'paste', enabled: params.isEditable },
        { label: '全选', role: 'selectAll' }
      ]).popup({ window: win });
    });
    await view.webContents.loadURL(targetUrl);
  } else if (urlOverride) {
    await view.webContents.loadURL(targetUrl);
  }
  showPlatform(key);
  return true;
});
ipcMain.handle('platform:cookie', async (_event, key, details) => {
  if (!platforms[key]) throw new Error('未知平台会话');
  return (await platformSession(key).cookies.get(details))[0] || null;
});
ipcMain.handle('platform:fetch', async (_event, key, spec) => {
  if (!platforms[key]) throw new Error('自动同步仅支持已接入的平台');
  const url = new URL(spec.url);
  const isExternalImage = spec.credentials === 'omit' && spec.method === 'GET' && publicImageHost(url.hostname);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || (!allowedPlatformHost(key, url.hostname) && !isExternalImage)) throw new Error('请求目标不在此平台的允许范围内');
  if (url.protocol !== 'https:' && !isExternalImage) throw new Error('平台操作只允许 HTTPS');
  const headers = new Headers(spec.headers || []);
  if (headers.has('cookie') || headers.has('host')) throw new Error('不允许手动设置 Cookie 或 Host');
  if (!isExternalImage) {
    const defaults = defaultPlatformHeaders(key, url.hostname);
    if (defaults.origin && !headers.has('origin')) headers.set('Origin', defaults.origin);
    if (defaults.referer && !headers.has('referer')) headers.set('Referer', defaults.referer);
  }
  let body = spec.body;
  if (body?.kind === 'form-data') {
    const form = new FormData();
    for (const item of body.entries) {
      if (item.value?.kind === 'blob') form.append(item.name, new Blob([item.value.bytes], { type: item.value.type || 'application/octet-stream' }), item.value.filename || 'upload.bin');
      else form.append(item.name, String(item.value));
    }
    body = form;
  } else if (body?.kind === 'bytes') body = body.bytes;
  else if (body?.kind === 'url-search-params') body = new URLSearchParams(body.value);
  else if (body?.kind === 'text') body = body.value;
  else body = undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60000, Math.max(1000, Number(spec.timeoutMs) || 25000)));
  try {
    const response = await platformSession(key).fetch(url.href, {
      method: spec.method || 'GET', headers, body,
      credentials: spec.credentials === 'omit' ? 'omit' : 'include',
      redirect: spec.redirect === 'error' ? 'error' : 'follow', signal: controller.signal
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, statusText: response.statusText, ok: response.ok, headers: [...response.headers.entries()], body: bytes };
  } finally { clearTimeout(timer); }
});
ipcMain.handle('platform:tab:create', async (_event, key, urlValue) => {
  if (!platforms[key]) throw new Error('未知平台');
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || !pageHostAllowed(key, url.hostname)) throw new Error('平台编辑页地址不匹配，已停止操作');
  const view = new WebContentsView({ webPreferences: { partition: `persist:article-sync-${key}`, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const id = crypto.randomUUID();
  temporaryTabs.set(id, { key, view });
  platformSessions.set(key, view.webContents.session);
  await view.webContents.loadURL(url.href);
  const finalUrl = new URL(view.webContents.getURL());
  if (!pageHostAllowed(key, finalUrl.hostname) || /\/login(?:\/|$)/i.test(finalUrl.pathname)) {
    view.webContents.close(); temporaryTabs.delete(id);
    throw new Error('编辑器需要登录，请先在软件内完成登录');
  }
  return id;
});
ipcMain.handle('platform:tab:execute', async (_event, key, id, source, args) => {
  const entry = temporaryTabs.get(id);
  if (!entry || entry.key !== key || typeof source !== 'string' || source.length > 100000) throw new Error('平台临时页面无效');
  const serialized = JSON.stringify(args);
  return entry.view.webContents.executeJavaScript(`(async()=>{const fn=(${source});return await fn(...${serialized});})()`, true);
});
ipcMain.handle('platform:tab:close', async (_event, key, id) => {
  const entry = temporaryTabs.get(id);
  if (entry?.key === key) { entry.view.webContents.close(); temporaryTabs.delete(id); }
  return true;
});
ipcMain.handle('browser:back', (_event, key) => { const wc = views.get(key)?.webContents; if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.handle('browser:forward', (_event, key) => { const wc = views.get(key)?.webContents; if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.handle('browser:reload', (_event, key) => views.get(key)?.webContents.reload());
ipcMain.handle('browser:navigate', (_event, key, address) => {
  const wc = views.get(key)?.webContents;
  let url;
  try { url = new URL(address.includes('://') ? address : `https://${address}`); } catch { throw new Error('请输入有效网址'); }
  if (url.protocol !== 'https:') throw new Error('登录页面仅允许 HTTPS 网址');
  return wc?.loadURL(url.href);
});
ipcMain.handle('browser:bounds', (_event, bounds) => setBounds({
  x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height))
}));
ipcMain.handle('browser:hide', () => { hideViews(); win.webContents.send('browser:active', null); });
