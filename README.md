# 文章同步工作台

Windows / Intel Mac desktop software for preparing articles and saving platform drafts. Source is in `v0.0.1/`.

## First release

GitHub Actions builds a Windows x64 installer, a Windows portable update archive, and Intel Mac DMG / ZIP assets. Find them under [Releases](https://github.com/52okp/52okptongbu/releases).

The macOS Intel app is not notarized; macOS may ask the user to approve the first launch.

## Updates

The app reads this repository's root `update.json`, downloads the platform-specific GitHub Release ZIP, verifies SHA-256, and starts the new version from a separate local directory. User data and platform sessions remain in the OS user-data directory.

For later releases, increment `v0.0.1/package.json` and push to `main`; GitHub Actions builds and publishes the new version and updates the manifest.

CSDN credentials are entered locally and encrypted by OS secure storage. No CSDN key is checked into this repository.
