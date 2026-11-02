$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
$dist = Join-Path $root 'node_modules\electron\dist'
$staging = Join-Path $root '.windows-app-staging'
$releaseRoot = Join-Path $root 'release'
$output = Join-Path $releaseRoot "win-$version"
$resources = Join-Path $output 'resources'
$assetName = "ArticleSyncWorkbench-$version-Windows-x64.zip"
$assetDir = Join-Path $releaseRoot 'assets'
$assetPath = Join-Path $assetDir $assetName

if (-not (Test-Path -LiteralPath (Join-Path $dist 'electron.exe'))) {
  throw 'Electron is missing. Run npm install first.'
}
New-Item -ItemType Directory -Force -Path $staging, $resources, $assetDir | Out-Null
$appFiles = @('main.cjs', 'preload.cjs', 'desktop.html', 'desktop.css', 'workbench-layout.css', 'button-layout.css', 'panel-alignment.css', 'sidebar-history.css', 'desktop.js', 'workbench.js', 'styles.css', 'package.json', 'THIRD-PARTY-NOTICES.md') | ForEach-Object { Join-Path $root $_ }
Copy-Item -LiteralPath $appFiles -Destination $staging -Force
$appDirs = @('lib', 'adapters', 'vendor') | ForEach-Object { Join-Path $root $_ }
Copy-Item -Path $appDirs -Destination $staging -Recurse -Force
Push-Location $root
try {
  & (Join-Path $root 'node_modules\.bin\asar.cmd') pack $staging (Join-Path $resources 'app.asar')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to package app.asar.' }
} finally { Pop-Location }
Copy-Item -Path (Join-Path $dist '*') -Destination $output -Recurse -Force
Move-Item -LiteralPath (Join-Path $output 'electron.exe') -Destination (Join-Path $output 'ArticleSyncWorkbench.exe') -Force
if (Test-Path -LiteralPath $assetPath) { Remove-Item -LiteralPath $assetPath -Force }
Compress-Archive -Path (Join-Path $output '*') -DestinationPath $assetPath -CompressionLevel Optimal
$shaAlgorithm = [System.Security.Cryptography.SHA256]::Create()
$assetStream = [System.IO.File]::OpenRead($assetPath)
try { $sha256 = [BitConverter]::ToString($shaAlgorithm.ComputeHash($assetStream)).Replace('-', '').ToLowerInvariant() }
finally { $assetStream.Dispose(); $shaAlgorithm.Dispose() }
$updateInfo = [ordered]@{
  app = 'ArticleSyncWorkbench'
  version = $version
  downloadUrl = "https://github.com/52okp/52okptongbu/releases/download/v$version/$assetName"
  sha256 = $sha256
  releaseUrl = "https://github.com/52okp/52okptongbu/releases/tag/v$version"
  notes = 'Article Sync Workbench Windows desktop update.'
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $root 'update.json'), ($updateInfo | ConvertTo-Json -Depth 4), $utf8NoBom)
Write-Output "Windows portable build: $(Join-Path $output 'ArticleSyncWorkbench.exe')"
Write-Output "GitHub release asset: $assetPath"
Write-Output "SHA-256: $sha256"
