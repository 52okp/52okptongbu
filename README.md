# 文章同步工作台

Windows / Intel Mac desktop software for preparing articles and saving platform drafts. Current source is in `v0.0.3/`.

## Downloads

GitHub Actions builds a Windows x64 installer, a Windows portable update archive, and Intel Mac DMG / ZIP. Download them from [GitHub Releases](https://github.com/52okp/52okptongbu/releases).

The macOS Intel build is not notarized. On first launch, macOS may ask you to approve it in Privacy & Security.

## Local data and updates

First launch asks for a local data folder. The folder can later be changed in Settings; articles, tasks, Chromium sessions, and encrypted CSDN credentials are copied, then the app restarts. The update button reads the root `update.json`, verifies the SHA-256 of the OS-specific release ZIP, and launches the new version separately while keeping user data in place.

CSDN App Key and Secret are entered on the device and encrypted using OS secure storage. They are not included in this public repository or release packages.
