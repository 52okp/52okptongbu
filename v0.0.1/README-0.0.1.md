# 文章同步工作台 0.0.1

## 下载

GitHub Actions 为每次版本发布构建 Windows x64 安装程序、Windows 便携更新包和 macOS Intel DMG / ZIP，并上传到 GitHub Releases。当前 macOS 包未签名或公证，首次打开可能需要在系统设置中确认。

软件左下角“检查更新”读取仓库根目录的 `update.json`，按操作系统下载对应 Release ZIP、校验 SHA-256，再从独立版本目录启动新版。文章数据、CSDN 凭据和平台登录会话保存在应用用户数据目录，不放进更新包。

## 本地开发

```powershell
npm install
npm start
```

## 本地构建

```powershell
npm run dist:win
npm run dist:mac
npm run build:win
```

`dist:win` 生成 Windows 安装程序，`dist:mac` 在 Intel Mac 或 GitHub Intel runner 上生成 DMG / ZIP，`build:win` 生成便携目录、更新 ZIP 和 Windows 更新清单。发布新版本时递增 `package.json` 中的版本号，推送到 `main` 后 GitHub Actions 会构建各平台安装包、发布 Release，并更新仓库根目录的 `update.json`。

## 功能和安全

- 本地编辑、自动保存、预览，导入 DOCX / Markdown / HTML / TXT，导出 HTML 备份。
- 支持头条、百家号、CSDN、小红书、哔哩哔哩、知乎、微博的账号检测和草稿操作。
- 同步前逐平台显示当前账号、文章和图片处理范围并确认。
- CSDN App Key / Secret 由用户在“设置 → CSDN 凭据”录入，使用操作系统安全存储加密；公开源码和更新包不包含凭据。
- 图片转存、草稿保存、任务去重、失败记录和结果待核对状态。
- 每个平台有独立的持久 Chromium 会话；支持添加自定义 HTTPS 登录网站。

本版只保存草稿，不公开发布或定时发布。平台接口可能变化，自动同步须由用户逐个平台实测。
