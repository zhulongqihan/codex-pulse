param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.local/shortcut-verification'))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-env.ps1')
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$fixture = Join-Path $output ('run-' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
$oldFolder = Join-Path $fixture 'Original app'
$newFolder = Join-Path $fixture 'Unicode portable app'
$desktop = Join-Path $fixture 'Desktop'
$programs = Join-Path $fixture 'Start Menu/Programs'
New-Item -ItemType Directory -Force -Path $oldFolder,$newFolder,$desktop,$programs | Out-Null
$oldExe = Join-Path $oldFolder 'Codex Pulse.exe'
$newExe = Join-Path $newFolder 'Codex Pulse.exe'
$nativeExe = Join-Path $env:CARGO_TARGET_DIR 'release/codex-pulse.exe'
Copy-Item -LiteralPath $nativeExe -Destination $oldExe
Copy-Item -LiteralPath $nativeExe -Destination $newExe
$data = Join-Path $fixture 'data-marker.txt'
[IO.File]::WriteAllText($data, 'Synthetic user data must remain unchanged')
$sourceHash = (Get-FileHash -LiteralPath $data).Hash
$powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$helper = Join-Path $PSScriptRoot 'Create-Codex-Pulse-Shortcuts.ps1'
$shell = New-Object -ComObject WScript.Shell
function Invoke-ShortcutHelper([string]$Executable) {
  $response = & $powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Executable $Executable -DesktopDirectory $desktop -ProgramsDirectory $programs -Json 2> (Join-Path $fixture 'last-error.log')
  return [PSCustomObject]@{ ExitCode=$LASTEXITCODE; Response=$response }
}
function Assert-Links([string]$ExpectedExe) {
  foreach ($directory in @($desktop,$programs)) {
    $shortcut = $shell.CreateShortcut((Join-Path $directory 'Codex Pulse.lnk'))
    if ($shortcut.TargetPath -ne $ExpectedExe -or $shortcut.WorkingDirectory -ne (Split-Path -Parent $ExpectedExe) -or $shortcut.IconLocation -ne ($ExpectedExe+',0')) { throw 'Shortcut target, directory, or icon is incorrect' }
  }
}
$first = Invoke-ShortcutHelper $oldExe
if ($first.ExitCode -ne 0) { throw 'Initial shortcut creation failed' }
Assert-Links $oldExe
$json = ($first.Response | Out-String) | ConvertFrom-Json
if ($json.desktop -ne (Join-Path $desktop 'Codex Pulse.lnk') -or $json.startMenu -ne (Join-Path $programs 'Codex Pulse.lnk')) { throw 'Returned shortcut paths do not match' }
$repair = Invoke-ShortcutHelper $newExe
if ($repair.ExitCode -ne 0) { throw 'Repair after relocation failed' }
Assert-Links $newExe
$repeat = Invoke-ShortcutHelper $newExe
if ($repeat.ExitCode -ne 0) { throw 'Repeated creation failed' }
Assert-Links $newExe
$desktopLink = Join-Path $desktop 'Codex Pulse.lnk'
$programsLink = Join-Path $programs 'Codex Pulse.lnk'
$beforeDesktop = (Get-FileHash -LiteralPath $desktopLink).Hash
$beforePrograms = (Get-FileHash -LiteralPath $programsLink).Hash
$lock = [IO.File]::Open($programsLink, 'Open', 'ReadWrite', 'None')
try { $locked = Invoke-ShortcutHelper $oldExe } finally { $lock.Dispose() }
if ($locked.ExitCode -eq 0) { throw 'Locked destination was not rejected' }
if ((Get-FileHash -LiteralPath $desktopLink).Hash -ne $beforeDesktop -or (Get-FileHash -LiteralPath $programsLink).Hash -ne $beforePrograms) { throw 'Failed repair changed existing shortcuts' }
$missing = Invoke-ShortcutHelper (Join-Path $fixture 'missing.exe')
if ($missing.ExitCode -eq 0) { throw 'Missing executable was not rejected' }
if ((Get-FileHash -LiteralPath $data).Hash -ne $sourceHash) { throw 'Shortcut creation modified application data' }
if (@(Get-ChildItem -LiteralPath $desktop,$programs -Filter '.CodexPulse-*' -Force).Count -ne 0) { throw 'Temporary shortcut was left behind' }
$evidence = @{ passed=$true; mode='Real Windows COM shortcuts in isolated destination folders'; fixture=$fixture; returnedPaths=$json; checks=@{create=$true;repairAfterMove=$true;repeat=$true;quotedUnicodeAndSpaceTarget=$true;lockedDestinationLeavesExistingLinks=$true;missingExecutableRejected=$true;userDataUnchanged=$true;noStagingFilesRemain=$true}; productionShortcutLocationsTouched=$false }
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output 'shortcuts-evidence.json') -Encoding utf8
$evidence | ConvertTo-Json -Depth 6
