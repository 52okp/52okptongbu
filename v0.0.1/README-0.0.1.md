# 文章同步工作台 0.0.1

## Windows 测试版

从 GitHub Releases 下载 `ArticleSyncWorkbench-0.0.1-Windows-x64.zip`，解压后运行 `ArticleSyncWorkbench.exe`。左下角“检查更新”会读取仓库根目录的 `update.json`，下载 Release 中的版本包，校验 SHA-256，再在独立目录启动新版本。文章和平台会话保存在应用用户数据目录，不会放进更新包。

## 本地开发与构建

```powershell
npm install
npm start
npm run build:win
```

构建会生成 `release\win-0.0.1` 便携目录、可发布的 ZIP 和 `update.json`。发布新版本时递增 `package.json` 中的版本号，运行构建脚本，再将 ZIP 上传到对应 GitHub Release，并提交新生成的 `update.json`。

## 当前功能

- 本地编辑、自动保存、预览，导入 DOCX / Markdown / HTML / TXT，导出 HTML 备份。
- 支持头条、百家号、CSDN、小红书、哔哩哔哩、知乎、微博的账号检测和草稿操作。
- CSDN App Key / Secret 通过“设置 → CSDN 凭据”在本机录入，Windows DPAPI 加密保存；更新包和公开源码不含这些值。
- 同步前逐平台显示当前账号、文章和图片处理范围并确认。
- 图片转存、草稿保存、任务去重、失败记录和结果待核对状态。
- 通过内嵌 Chromium 登录；每个平台使用独立的持久会话。
- 支持添加自定义 HTTPS 登录网站。

本版只保存草稿，不公开发布或定时发布。平台接口可能变化，自动同步须由用户逐个平台实测。
