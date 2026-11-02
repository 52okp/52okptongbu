# 文章同步工作台

Windows / Intel Mac desktop software for preparing articles and saving platform drafts. Source code is under `v0.0.1/`.

## First release

GitHub Actions builds a Windows x64 NSIS installer, a Windows portable update archive, and Intel Mac DMG / ZIP assets, then publishes them as a GitHub Release. Download them from [Releases](https://github.com/52okp/52okptongbu/releases).

The macOS Intel build is not notarized or code-signed for distribution. macOS may require the user to approve opening it in Privacy & Security settings.

## Automatic updates

The desktop app reads the root `update.json`, selects the asset for the current operating system, checks its SHA-256, and launches the new version from a separate local directory. Article data and platform sessions stay in the app user-data directory.

The update manifest is published only after the corresponding Release assets are available. CSDN credentials are entered on-device and encrypted with the OS secure storage; no credential is included in this repository or the release packages.
