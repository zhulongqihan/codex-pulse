param(
  [string]$Executable = (Join-Path $PSScriptRoot 'CodexPulse.exe'),
  [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
  [string]$ProgramsDirectory = [Environment]::GetFolderPath('Programs'),
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding
$executablePath = [IO.Path]::GetFullPath($Executable)
if (!(Test-Path -LiteralPath $executablePath -PathType Leaf) -or [IO.Path]::GetExtension($executablePath) -ine '.exe') {
  throw 'Codex Pulse executable is missing. Extract the complete portable package first.'
}
$workingDirectory = Split-Path -Parent $executablePath
$directories = @($DesktopDirectory, $ProgramsDirectory)
foreach ($directory in $directories) {
  if ([string]::IsNullOrWhiteSpace($directory) -or ![IO.Path]::IsPathRooted($directory)) { throw 'Shortcut destination is unavailable.' }
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
$shell = New-Object -ComObject WScript.Shell
$entries = @()
$nonce = [Guid]::NewGuid().ToString('N')
try {
  foreach ($directory in $directories) {
    $destination = Join-Path $directory 'Codex Pulse.lnk'
    $stage = Join-Path $directory ('.CodexPulse-' + $nonce + '.lnk')
    $previous = if (Test-Path -LiteralPath $destination) { [IO.File]::ReadAllBytes($destination) } else { $null }
    $entry = [PSCustomObject]@{ Destination=$destination; Stage=$stage; Previous=$previous; Written=$false }
    $entries += $entry
    $shortcut = $shell.CreateShortcut($stage)
    $shortcut.TargetPath = $executablePath
    $shortcut.WorkingDirectory = $workingDirectory
    $shortcut.IconLocation = $executablePath + ',0'
    $shortcut.Description = 'Codex Pulse - local usage, account capacity and session replay'
    $shortcut.WindowStyle = 1
    $shortcut.Save()
    $check = $shell.CreateShortcut($stage)
    if ($check.TargetPath -ine $executablePath -or $check.WorkingDirectory -ine $workingDirectory) { throw 'Shortcut verification failed.' }
  }
  foreach ($entry in $entries) {
    Move-Item -LiteralPath $entry.Stage -Destination $entry.Destination -Force
    $entry.Written = $true
  }
} catch {
  foreach ($entry in $entries) {
    if ($entry.Written) {
      if ($null -ne $entry.Previous) { [IO.File]::WriteAllBytes($entry.Destination, $entry.Previous) }
      elseif (Test-Path -LiteralPath $entry.Destination) { Remove-Item -LiteralPath $entry.Destination -Force }
    }
  }
  throw
} finally {
  foreach ($entry in $entries) {
    if (Test-Path -LiteralPath $entry.Stage) { Remove-Item -LiteralPath $entry.Stage -Force }
  }
}
$result = [PSCustomObject]@{ desktop=$entries[0].Destination; startMenu=$entries[1].Destination }
if ($Json) { $result | ConvertTo-Json -Compress }
else { Write-Output 'Codex Pulse shortcuts are ready on your Desktop and in the Start menu.' }
