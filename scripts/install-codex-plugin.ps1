param(
  [string]$AppDirectory,
  [string]$DataDirectory,
  [string]$CodexHome,
  [string]$CodexExecutable,
  [switch]$PrepareOnly,
  [switch]$NoOpen,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding

if ([string]::IsNullOrWhiteSpace($AppDirectory)) {
  $AppDirectory = $PSScriptRoot
  if (!(Test-Path -LiteralPath (Join-Path $AppDirectory 'CodexPulse.exe')) -and !(Test-Path -LiteralPath (Join-Path $AppDirectory 'codex-pulse.exe'))) {
    $AppDirectory = Split-Path -Parent $PSScriptRoot
  }
}
if (![IO.Path]::IsPathRooted($AppDirectory)) { throw 'AppDirectory must be an absolute path.' }
$appRoot = [IO.Path]::GetFullPath($AppDirectory)
if ($appRoot.Contains(';')) { throw 'The Pulse application folder must not contain a semicolon because the Codex plugin uses a PATH entry.' }
if (!(Test-Path -LiteralPath $appRoot -PathType Container)) { throw 'The Codex Pulse application directory does not exist.' }
if ([string]::IsNullOrWhiteSpace($DataDirectory)) {
  if (![string]::IsNullOrWhiteSpace($env:PULSE_DATA_DIR)) { $DataDirectory = $env:PULSE_DATA_DIR }
  else { $DataDirectory = Join-Path $appRoot 'data' }
}
if ($DataDirectory -notmatch '^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$))') { throw 'DataDirectory must be a fully qualified absolute path.' }
$dataRoot = [IO.Path]::GetFullPath($DataDirectory)
$executable = @('CodexPulse.exe', 'codex-pulse.exe') | ForEach-Object { Join-Path $appRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$executable) { throw 'Codex Pulse executable is missing. Extract the complete portable package first.' }
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable).ProductVersion
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Cannot read a stable Codex Pulse version from the executable.' }
if (![string]::IsNullOrWhiteSpace($CodexHome) -and ![IO.Path]::IsPathRooted($CodexHome)) { throw 'CodexHome must be an absolute path.' }

$templateCandidates = @(
  (Join-Path $PSScriptRoot 'integrations/codex'),
  (Join-Path (Split-Path -Parent $PSScriptRoot) 'integrations/codex')
)
$templateRoot = $templateCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'plugins/codex-pulse/plugin.json') -PathType Leaf } | Select-Object -First 1
if (!$templateRoot) { throw 'The Codex plugin templates are missing. Extract the complete portable package first.' }
$pluginManifest = Get-Content -LiteralPath (Join-Path $templateRoot 'plugins/codex-pulse/plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$mcpManifest = Get-Content -LiteralPath (Join-Path $templateRoot 'plugins/codex-pulse/mcp.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$marketplaceManifest = Get-Content -LiteralPath (Join-Path $templateRoot '.agents/plugins/marketplace.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$iconSource = Join-Path $templateRoot 'plugins/codex-pulse/assets/icon.png'
if (!(Test-Path -LiteralPath $iconSource -PathType Leaf)) { throw 'The Codex Pulse plugin icon is missing.' }

$marketplaceRoot = [IO.Path]::GetFullPath((Join-Path $appRoot 'integrations/codex'))
$pluginRoot = Join-Path $marketplaceRoot 'plugins/codex-pulse'
$marketplacePath = Join-Path $marketplaceRoot '.agents/plugins/marketplace.json'
# Generated manifests stay outside data and the session-log trees.
# Reject links rather than writing through an application-owned integration path to another directory.
foreach ($relativeDirectory in @('integrations','integrations/codex','integrations/codex/.agents','integrations/codex/.agents/plugins','integrations/codex/plugins','integrations/codex/plugins/codex-pulse','integrations/codex/plugins/codex-pulse/assets')) {
  $directory = Join-Path $appRoot $relativeDirectory
  if (Test-Path -LiteralPath $directory) {
    $item = Get-Item -LiteralPath $directory -Force
    if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The integration destination must use ordinary directories inside the application folder.' }
  } else { New-Item -ItemType Directory -Path $directory | Out-Null }
}
$pluginManifest.version = $version
$mcpManifest.mcpServers.'codex-pulse'.command = [IO.Path]::GetFileName($executable)
$mcpManifest.mcpServers.'codex-pulse'.args = @('--mcp')
# Agent Plugins permits a bare executable token, not an absolute command path.
# Keep the inherited PATH intact after the application directory so the host resolves this installation.
$pluginPath = $appRoot
if (![string]::IsNullOrEmpty($env:PATH)) { $pluginPath += ';' + $env:PATH }
$mcpManifest.mcpServers.'codex-pulse' | Add-Member -MemberType NoteProperty -Name env -Value ([PSCustomObject]@{ PATH=$pluginPath; PULSE_DATA_DIR=$dataRoot }) -Force
function Write-PluginJson([string]$Path, $Value) {
  if ((Test-Path -LiteralPath $Path) -and ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'An integration file must not be a filesystem link.' }
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 16) + [Environment]::NewLine, $OutputEncoding)
}
Write-PluginJson (Join-Path $pluginRoot 'plugin.json') $pluginManifest
Write-PluginJson (Join-Path $pluginRoot 'mcp.json') $mcpManifest
Write-PluginJson $marketplacePath $marketplaceManifest
$iconDestination = Join-Path $pluginRoot 'assets/icon.png'
if ((Test-Path -LiteralPath $iconDestination) -and ((Get-Item -LiteralPath $iconDestination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The integration icon must not be a filesystem link.' }
if ([IO.Path]::GetFullPath($iconSource) -ine [IO.Path]::GetFullPath($iconDestination)) { Copy-Item -LiteralPath $iconSource -Destination $iconDestination -Force }

$deepLink = 'codex://plugins/codex-pulse?marketplacePath=' + [Uri]::EscapeDataString($marketplacePath)
$registered = $false
$opened = $false
if (!$PrepareOnly) {
  if ([string]::IsNullOrWhiteSpace($CodexExecutable)) {
    $codexCommand = Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$codexCommand) { throw "Codex CLI is unavailable. Use -PrepareOnly to generate the plugin and its install link. Link: $deepLink" }
    $CodexExecutable = $codexCommand.Source
  }
  $previousCodexHome = $env:CODEX_HOME
  try {
    if (![string]::IsNullOrWhiteSpace($CodexHome)) { $env:CODEX_HOME = [IO.Path]::GetFullPath($CodexHome) }
    $registrationOutput = & $CodexExecutable plugin marketplace add $marketplaceRoot --json
    if ($LASTEXITCODE -ne 0) { throw 'Codex could not register the local marketplace. Generated plugin files remain available.' }
    $registration = ($registrationOutput | Out-String) | ConvertFrom-Json
    if ($registration.marketplaceName -ne 'codex-pulse-local') { throw 'Codex returned an unexpected marketplace registration result.' }
    $registered = $true
  } finally {
    if ($null -eq $previousCodexHome) { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
    else { $env:CODEX_HOME = $previousCodexHome }
  }
  if (!$NoOpen) { Start-Process -FilePath $deepLink | Out-Null; $opened = $true }
}

$result = [PSCustomObject]@{
  appDirectory = $appRoot
  executable = $executable
  dataDirectory = $dataRoot
  version = $version
  pluginRoot = $pluginRoot
  marketplaceRoot = $marketplaceRoot
  marketplacePath = $marketplacePath
  deepLink = $deepLink
  prepared = $true
  registered = $registered
  opened = $opened
}
if ($Json) { $result | ConvertTo-Json -Compress }
else {
  Write-Output ('Codex Pulse plugin files are ready: ' + $pluginRoot)
  if ($registered) { Write-Output 'The local marketplace is registered. Complete Install in the Codex plugin details.' }
  Write-Output ('Install link: ' + $deepLink)
}
