$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
$dist = Join-Path $root 'node_modules\electron\dist'
$releaseRoot = Join-Path $root 'release'
$staging = Join-Path $root '.windows-app-staging'
$output = Join-Path $releaseRoot "win-$version"
$resources = Join-Path $output 'resources'
$electronBuilderOutput = Join-Path $releaseRoot 'win-unpacked'
$assetName = "ArticleSyncWorkbench-$version-Windows-x64.zip"
$assetDir = Join-Path $releaseRoot 'assets'
$assetPath = Join-Path $assetDir $assetName

New-Item -ItemType Directory -Force -Path $output, $assetDir | Out-Null
$unpackedExe = Get-ChildItem -LiteralPath $electronBuilderOutput -Filter '*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($unpackedExe) {
  Copy-Item -Path (Join-Path $electronBuilderOutput '*') -Destination $output -Recurse -Force
  Move-Item -LiteralPath (Join-Path $output $unpackedExe.Name) -Destination (Join-Path $output 'ArticleSyncWorkbench.exe') -Force
} else {
  if (-not (Test-Path -LiteralPath (Join-Path $dist 'electron.exe'))) {
    throw 'Electron is missing. Run npm ci or npm run dist:win first.'
  }
  New-Item -ItemType Directory -Force -Path $staging, $resources | Out-Null
  $appFiles = @('main.cjs', 'preload.cjs', 'desktop.html', 'desktop.css', 'workbench-layout.css', 'button-layout.css', 'panel-alignment.css', 'sidebar-history.css', 'desktop.js', 'workbench.js', 'styles.css', 'package.json', 'THIRD-PARTY-NOTICES.md') | ForEach-Object { Join-Path $root $_ }
  $appFiles += @('planner-main.cjs','planner-preload.cjs','planner.html','planner.css','planner.js') | ForEach-Object { Join-Path $root $_ }
  Copy-Item -LiteralPath $appFiles -Destination $staging -Force
  $appDirs = @('lib', 'adapters', 'vendor', 'assets') | ForEach-Object { Join-Path $root $_ }
  Copy-Item -Path $appDirs -Destination $staging -Recurse -Force
  Push-Location $root
  try {
    & (Join-Path $root 'node_modules\.bin\asar.cmd') pack $staging (Join-Path $resources 'app.asar')
    if ($LASTEXITCODE -ne 0) { throw 'Failed to package app.asar.' }
  } finally { Pop-Location }
  Copy-Item -Path (Join-Path $dist '*') -Destination $output -Recurse -Force
  $appExe = Join-Path $output 'ArticleSyncWorkbench.exe'
  Move-Item -LiteralPath (Join-Path $output 'electron.exe') -Destination $appExe -Force
  $rcedit = Join-Path $root 'node_modules\electron-winstaller\vendor\rcedit.exe'
  if (-not (Test-Path -LiteralPath $rcedit)) { throw 'rcedit.exe is missing; cannot apply the Windows app icon.' }
  & $rcedit $appExe --set-icon (Join-Path $root 'assets\app.ico')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to set the Windows portable app icon.' }
}
if (Test-Path -LiteralPath $assetPath) { Remove-Item -LiteralPath $assetPath -Force }
Compress-Archive -Path (Join-Path $output '*') -DestinationPath $assetPath -CompressionLevel Optimal
$shaAlgorithm = [System.Security.Cryptography.SHA256]::Create()
$installerName = "ArticleSyncWorkbench-$version-Windows-x64-setup.exe"
$installerPath = Join-Path $releaseRoot $installerName
if (-not (Test-Path -LiteralPath $installerPath)) { throw 'Build the Windows installer with npm run dist:win before generating update metadata.' }
$assetStream = [System.IO.File]::OpenRead($installerPath)
try { $sha256 = [BitConverter]::ToString($shaAlgorithm.ComputeHash($assetStream)).Replace('-', '').ToLowerInvariant() }
finally { $assetStream.Dispose(); $shaAlgorithm.Dispose() }
$updateInfo = [ordered]@{
  app = 'ArticleSyncWorkbench'
  version = $version
  downloadUrl = "https://github.com/52okp/52okptongbu/releases/download/v$version/$installerName"
  sha256 = $sha256
  releaseUrl = "https://github.com/52okp/52okptongbu/releases/tag/v$version"
  notes = 'Article Sync Workbench Windows desktop update.'
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $root 'update.json'), ($updateInfo | ConvertTo-Json -Depth 4), $utf8NoBom)
Write-Output "Windows portable build: $(Join-Path $output 'ArticleSyncWorkbench.exe')"
Write-Output "GitHub release asset: $assetPath"
Write-Output "SHA-256: $sha256"
