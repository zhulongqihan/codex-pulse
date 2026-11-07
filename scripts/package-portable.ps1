param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-env.ps1')
Set-Location $pulseRoot
if (!$SkipBuild) {
  pnpm exec tauri build --no-bundle
  if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
}
$manifest = Get-Content -LiteralPath (Join-Path $pulseRoot 'package.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$binary = Join-Path $env:CARGO_TARGET_DIR 'release/codex-pulse.exe'
if (!(Test-Path -LiteralPath $binary)) { throw 'Release executable is missing' }
$release = Join-Path $pulseRoot 'release'
$staging = Join-Path $release "CodexPulse-$version-windows-x64"
New-Item -ItemType Directory -Force -Path $staging | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $staging 'CodexPulse.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-Codex-Pulse.cmd') -Destination $staging -Force
Copy-Item -LiteralPath (Join-Path $pulseRoot 'LICENSE') -Destination $staging -Force
Copy-Item -LiteralPath (Join-Path $pulseRoot 'THIRD_PARTY_LICENSES.txt') -Destination $staging -Force
Copy-Item -LiteralPath (Join-Path $pulseRoot 'THIRD_PARTY_NOTICES.md') -Destination $staging -Force
Copy-Item -LiteralPath (Join-Path $pulseRoot 'vendor/codex-usage-desktop/LICENSE') -Destination (Join-Path $staging 'LICENSE-Codex-Usage-Desktop.txt') -Force
Copy-Item -LiteralPath (Join-Path $pulseRoot 'docs/PORTABLE.md') -Destination (Join-Path $staging 'README.txt') -Force
$archive = Join-Path $release "CodexPulse-$version-windows-x64.zip"
Compress-Archive -LiteralPath (Join-Path $staging 'CodexPulse.exe'),(Join-Path $staging 'Start-Codex-Pulse.cmd'),(Join-Path $staging 'LICENSE'),(Join-Path $staging 'LICENSE-Codex-Usage-Desktop.txt'),(Join-Path $staging 'THIRD_PARTY_LICENSES.txt'),(Join-Path $staging 'THIRD_PARTY_NOTICES.md'),(Join-Path $staging 'README.txt') -DestinationPath $archive -Force
$updateBinary = Join-Path $release "CodexPulse-$version-windows-x64.exe"
Copy-Item -LiteralPath $binary -Destination $updateBinary -Force
foreach ($file in @($archive, $updateBinary)) {
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([IO.Path]::GetFileName($file))" | Set-Content -LiteralPath "$file.sha256" -Encoding ascii
}
Write-Output $archive
