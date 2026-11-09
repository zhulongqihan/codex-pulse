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

$marketplaceRoot = [IO.Path]::GetFullPath((Join-Path $appRoot 'integrations/codex'))
$pluginRoot = Join-Path $marketplaceRoot 'plugins/codex-pulse'
$marketplacePath = Join-Path $marketplaceRoot '.agents/plugins/marketplace.json'
$preparation = 'embedded'
# 0.7.1 introduced this explicit headless command. Never probe older binaries
# with an unknown flag: they may open a GUI. Never fall back after a real error.
if ([Version]$version -ge [Version]'0.7.1') {
  function Quote-NativeArgument([string]$Argument) {
    # Windows CommandLineToArgvW/CRT rules, including trailing backslashes.
    $quoted = [Regex]::Replace($Argument, '(\\*)"', '$1$1\"')
    $quoted = [Regex]::Replace($quoted, '(\\+)$', '$1$1')
    return '"' + $quoted + '"'
  }
  $nativeStart = New-Object Diagnostics.ProcessStartInfo
  $nativeStart.FileName = $executable
  $nativeStart.WorkingDirectory = $appRoot
  $nativeStart.Arguments = (@('--prepare-codex-integration','--json','--data-directory',$dataRoot) | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
  $nativeStart.UseShellExecute = $false
  $nativeStart.CreateNoWindow = $true
  $nativeStart.RedirectStandardOutput = $true
  $nativeStart.RedirectStandardError = $true
  $nativeStart.StandardOutputEncoding = $OutputEncoding
  $nativeStart.StandardErrorEncoding = $OutputEncoding
  $nativeProcess = New-Object Diagnostics.Process
  $nativeProcess.StartInfo = $nativeStart
  try {
    [void]$nativeProcess.Start()
    # A release GUI executable is not synchronously awaited by PS5's call
    # operator. Drain both pipes concurrently and check this process's exit code.
    $nativeStdout = $nativeProcess.StandardOutput.ReadToEndAsync()
    $nativeStderr = $nativeProcess.StandardError.ReadToEndAsync()
    if (!$nativeProcess.WaitForExit(30000)) {
      # This is only the headless child started above, never a running desktop instance.
      try { $nativeProcess.Kill(); [void]$nativeProcess.WaitForExit(5000) } catch {}
      throw 'Pulse plugin preparation timed out. No legacy template fallback was attempted.'
    }
    if (![Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($nativeStdout,$nativeStderr),5000)) { throw 'Pulse preparation output did not complete. No legacy template fallback was attempted.' }
    if ($nativeProcess.ExitCode -ne 0) { throw 'The installed Pulse executable could not prepare its embedded Codex plugin. No legacy template fallback was attempted.' }
    $nativeOutput = $nativeStdout.Result
    # Do not relay arbitrary child stderr into installation output.
  } finally { $nativeProcess.Dispose() }
  try { $nativePrepared = ($nativeOutput | Out-String).Trim() | ConvertFrom-Json }
  catch { throw 'The installed Pulse executable returned an invalid preparation result. No legacy template fallback was attempted.' }
  if ([string]::IsNullOrWhiteSpace($nativePrepared.marketplacePath) -or [IO.Path]::GetFullPath($nativePrepared.marketplacePath) -ine [IO.Path]::GetFullPath($marketplacePath) -or $nativePrepared.opened -ne $false) { throw 'Pulse returned an unexpected prepared Codex marketplace.' }
} else {
  $preparation = 'legacy-templates'
  $templateCandidates = @((Join-Path $PSScriptRoot 'integrations/codex'), (Join-Path (Split-Path -Parent $PSScriptRoot) 'integrations/codex'))
  $templateRoot = $templateCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'plugins/codex-pulse/plugin.json') -PathType Leaf } | Select-Object -First 1
  if (!$templateRoot) { throw 'This older Pulse executable requires the complete portable package to prepare its Codex plugin.' }
  $pluginManifest = Get-Content -LiteralPath (Join-Path $templateRoot 'plugins/codex-pulse/plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $mcpManifest = Get-Content -LiteralPath (Join-Path $templateRoot 'plugins/codex-pulse/mcp.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $marketplaceManifest = Get-Content -LiteralPath (Join-Path $templateRoot '.agents/plugins/marketplace.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $iconSource = Join-Path $templateRoot 'plugins/codex-pulse/assets/icon.png'
  if (!(Test-Path -LiteralPath $iconSource -PathType Leaf)) { throw 'The Codex Pulse plugin icon is missing.' }
  # Generated files stay outside data. Reject links and unexpected directories.
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
  $pluginPath = $appRoot
  if (![string]::IsNullOrEmpty($env:PATH)) { $pluginPath += ';' + $env:PATH }
  $mcpManifest.mcpServers.'codex-pulse' | Add-Member -MemberType NoteProperty -Name env -Value ([PSCustomObject]@{ PATH=$pluginPath; PULSE_DATA_DIR=$dataRoot }) -Force
  function Assert-PluginDestination([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
      $item = Get-Item -LiteralPath $Path -Force
      if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'An integration file must be a regular file without links.' }
    }
  }
  function Write-PluginBytes([string]$Path, [byte[]]$Bytes) {
    Assert-PluginDestination $Path
    if (Test-Path -LiteralPath $Path) {
      $existing = [IO.File]::ReadAllBytes($Path)
      $same = $existing.Length -eq $Bytes.Length
      for ($index=0; $same -and $index -lt $Bytes.Length; $index++) { $same = $existing[$index] -eq $Bytes[$index] }
      if ($same) { return }
    }
    $temporary = Join-Path (Split-Path -Parent $Path) ('.pulse-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = $temporary + '.backup'
    try {
      [IO.File]::WriteAllBytes($temporary, $Bytes)
      Assert-PluginDestination $Path
      if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temporary, $Path, $backup) }
      else { [IO.File]::Move($temporary, $Path) }
    } finally {
      foreach ($transientFile in @($temporary, $backup)) { if (Test-Path -LiteralPath $transientFile) { Remove-Item -LiteralPath $transientFile -Force } }
    }
  }
  $outputs = @(
    @{Path=(Join-Path $pluginRoot 'mcp.json');Bytes=$OutputEncoding.GetBytes(($mcpManifest | ConvertTo-Json -Depth 16) + [Environment]::NewLine)},
    @{Path=(Join-Path $pluginRoot 'assets/icon.png');Bytes=[IO.File]::ReadAllBytes($iconSource)},
    @{Path=$marketplacePath;Bytes=$OutputEncoding.GetBytes(($marketplaceManifest | ConvertTo-Json -Depth 16) + [Environment]::NewLine)},
    @{Path=(Join-Path $pluginRoot 'plugin.json');Bytes=$OutputEncoding.GetBytes(($pluginManifest | ConvertTo-Json -Depth 16) + [Environment]::NewLine)}
  )
  foreach ($output in $outputs) { Assert-PluginDestination $output.Path }
  foreach ($output in $outputs) { Write-PluginBytes $output.Path $output.Bytes }
}
# Validate the final files, not a stale host cache or an optimistic process exit.
$boundPlugin = Get-Content -LiteralPath (Join-Path $pluginRoot 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$boundMcp = Get-Content -LiteralPath (Join-Path $pluginRoot 'mcp.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$boundServer = $boundMcp.mcpServers.'codex-pulse'
if ($boundPlugin.version -ne $version -or $boundServer.command -ne [IO.Path]::GetFileName($executable) -or @($boundServer.args).Count -ne 1 -or $boundServer.args[0] -ne '--mcp' -or $boundServer.env.PULSE_DATA_DIR -ine $dataRoot -or [string]::IsNullOrWhiteSpace($boundServer.env.PATH) -or ($boundServer.env.PATH -split ';')[0] -ine $appRoot) { throw 'The prepared Codex plugin does not match this executable and data directory.' }

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
  preparation = $preparation
  registered = $registered
  opened = $opened
}
if ($Json) { $result | ConvertTo-Json -Compress }
else {
  Write-Output ('Codex Pulse plugin files are ready: ' + $pluginRoot)
  if ($registered) { Write-Output 'The local marketplace is registered. Complete Install in the Codex plugin details.' }
  Write-Output ('Install link: ' + $deepLink)
}
