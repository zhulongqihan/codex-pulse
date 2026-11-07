$ErrorActionPreference = 'Stop'
$pulseRoot = Split-Path -Parent $PSScriptRoot
$pulseCache = Join-Path (Split-Path -Parent $pulseRoot) '.cache/codexpulse-parity'
$env:TEMP = Join-Path $pulseCache 'tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:CARGO_HOME = Join-Path $pulseCache 'cargo'
$env:CARGO_TARGET_DIR = Join-Path $pulseCache 'target'
$env:npm_config_cache = Join-Path $pulseCache 'npm'
$env:npm_config_store_dir = Join-Path $pulseCache 'pnpm-store'
$env:PNPM_HOME = Join-Path $pulseCache 'pnpm'
$env:XDG_CACHE_HOME = Join-Path $pulseCache 'xdg'
$registryUri = [Uri]'https://index.crates.io/config.json'
$registryProxy = [System.Net.WebRequest]::DefaultWebProxy.GetProxy($registryUri)
if (!$env:CARGO_HTTP_PROXY -and $registryProxy -ne $registryUri) { $env:CARGO_HTTP_PROXY = $registryProxy.AbsoluteUri }
$env:CARGO_HTTP_TIMEOUT = '60'
New-Item -ItemType Directory -Force -Path $env:TEMP,$env:CARGO_HOME,$env:CARGO_TARGET_DIR,$env:npm_config_cache,$env:PNPM_HOME,$env:XDG_CACHE_HOME | Out-Null
$pulseNode = Join-Path $pulseCache 'tools/node-v24.15.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $pulseNode 'node.exe')) { $env:PATH = "$pulseNode;$env:PATH" }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
  $pulseVs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($pulseVs) {
    $pulseDevCmd = Join-Path $pulseVs 'Common7/Tools/VsDevCmd.bat'
    cmd /c "`"$pulseDevCmd`" -no_logo -arch=x64 -host_arch=x64 && set" | ForEach-Object {
      if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
    }
  }
}
