# 文章同步工作台 0.0.3

## 下载

GitHub Actions 会构建 Windows x64 安装程序、Windows 便携更新包和 macOS Intel DMG / ZIP，并发布到 GitHub Releases。macOS 包未签名或公证，首次打开可能需要在系统设置中确认。

左下角“检查更新”会读取仓库根目录的 `update.json`，按操作系统下载对应 Release ZIP、校验 SHA-256，再从独立版本目录启动新版。文章、平台登录会话和本机 CSDN 凭据保存在所选数据目录，不放进更新包。

首次启动时会要求选择本地数据目录。可在“设置 → 更改本地数据路径”迁移到其他目录；切换时应用会复制文章、任务、网站会话和 CSDN 凭据，并在重启后切换到新位置。

## 本地开发与构建

```powershell
npm ci
npm start
npm run dist:win
npm run dist:mac
npm run build:win
```

`dist:win` 生成 Windows 安装程序，`dist:mac` 生成 Intel Mac DMG / ZIP，`build:win` 生成便携更新包。推送到仓库 `main` 后，GitHub Actions 会构建并发布新版本。

## 功能

- 支持头条、百家号、CSDN、小红书、哔哩哔哩、知乎、微博账号检测和草稿操作。
- 同步前逐平台显示账号、文章、图片处理范围并确认。
- CSDN App Key / Secret 在“设置 → CSDN 凭据”录入，通过操作系统安全存储加密。
- 每个平台使用独立的持久 Chromium 会话；可添加自定义 HTTPS 登录网站。
- 文章导入、编辑、预览、HTML 备份和任务去重。

本版只保存草稿，不公开发布或定时发布。平台接口可能变化，自动同步须由用户逐个平台实测。
