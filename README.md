# 文章同步工作台

Windows x64 article drafting app. Versioned source is in `v0.0.1/`.

## Download

Download the ZIP from [GitHub Releases](https://github.com/52okp/52okptongbu/releases), extract it, and run `ArticleSyncWorkbench.exe`.

## Automatic updates

The app reads this repository's root `update.json`. When it finds a newer version, it downloads the matching GitHub Release ZIP, verifies the SHA-256 digest, extracts the new version into a separate local directory, and starts it. Article data and platform sessions remain in the Windows user-data folder.

## Release workflow

For each release, increment the version in `v0.0.1/package.json`, run `npm run build:win` in that directory, upload the generated ZIP to the matching GitHub Release, then commit the generated `update.json` to this repository's root with the new source.

The app saves drafts only; it does not publicly publish articles.
