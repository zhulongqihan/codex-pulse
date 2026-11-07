param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$update = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$destination = [IO.Path]::GetFullPath($update.executable)
$package = [IO.Path]::GetFullPath($update.package)
$dataDirectory = [IO.Path]::GetFullPath($update.dataDir)
if (!(Test-Path -LiteralPath $destination) -or !$package.StartsWith(($dataDirectory.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid update location' }
if ([IO.Path]::GetFullPath($update.health) -ne (Join-Path $dataDirectory 'updates/healthy')) { throw 'Invalid update health location' }
$backup = $destination + '.previous'
$incoming = $destination + '.incoming'
Wait-Process -Id $update.processId -Timeout 30 -ErrorAction SilentlyContinue
if (Get-Process -Id $update.processId -ErrorAction SilentlyContinue) { throw 'Pulse did not exit; existing version preserved' }
$replaced = $false
$newProcess = $null
try {
  # .NET is available with Windows PowerShell even if PSModulePath was inherited
  # from PowerShell 7 or another host that cannot discover Get-FileHash.
  $stream = [IO.File]::OpenRead($package)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $digest = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $hasher.Dispose() }
  if ($digest -ne $update.sha256) { throw 'Update changed after verification' }
  if (Test-Path -LiteralPath $update.health) { Remove-Item -LiteralPath $update.health -Force }
  Copy-Item -LiteralPath $package -Destination $incoming -Force
  Copy-Item -LiteralPath $destination -Destination $backup -Force
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { Move-Item -LiteralPath $incoming -Destination $destination -Force; $replaced = $true; break }
    catch { if ($attempt -eq 19) { throw }; Start-Sleep -Milliseconds 500 }
  }
  $env:PULSE_DATA_DIR = $dataDirectory
  $newProcess = Start-Process -FilePath $destination -WorkingDirectory (Split-Path -Parent $destination) -WindowStyle Hidden -PassThru
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ((Test-Path -LiteralPath $update.health) -and (Get-Content -LiteralPath $update.health -Raw) -eq $update.version) { $ready = $true; break }
    if ($newProcess.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) { throw 'Updated app did not confirm startup' }
  Remove-Item -LiteralPath (Join-Path $dataDirectory 'updates/pending.json') -Force -ErrorAction SilentlyContinue
  'Update installed successfully' | Set-Content -LiteralPath (Join-Path $dataDirectory 'updates/result.txt')
} catch {
  $failure = $_.Exception.Message
  if ($newProcess -and !$newProcess.HasExited) { Stop-Process -Id $newProcess.Id -Force; Wait-Process -Id $newProcess.Id -ErrorAction SilentlyContinue }
  if ($replaced -and (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $backup -Destination $destination -Force }
  $pending = Join-Path $dataDirectory 'updates/pending.json'
  if (Test-Path -LiteralPath $pending) { Move-Item -LiteralPath $pending -Destination (Join-Path $dataDirectory 'updates/pending.failed.json') -Force }
  if (Test-Path -LiteralPath $update.health) { Remove-Item -LiteralPath $update.health -Force }
  if (Test-Path -LiteralPath $incoming) { Remove-Item -LiteralPath $incoming -Force }
  "Update failed: $failure. Previous executable restored; user data preserved." | Set-Content -LiteralPath (Join-Path $dataDirectory 'updates/result.txt')
  $env:PULSE_DATA_DIR = $dataDirectory
  Start-Process -FilePath $destination -WorkingDirectory (Split-Path -Parent $destination) -WindowStyle Hidden
  exit 1
}
