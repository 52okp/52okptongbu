# 文章同步工作台

Windows x64 desktop app for preparing articles and saving platform drafts.

## Download

Download the latest `ArticleSyncWorkbench-<version>-Windows-x64.zip` from [GitHub Releases](https://github.com/52okp/52okptongbu/releases). Extract the archive and run `ArticleSyncWorkbench.exe`.

The app checks the root `update.json` file for newer versions, downloads the matching GitHub Release asset, verifies its SHA-256 digest, and launches the update from a separate local version directory. App data and platform sessions remain in the Windows user-data directory.

## Source

Versioned Windows app source is under `v0.0.1/`. The app saves drafts only; it does not publish articles publicly.