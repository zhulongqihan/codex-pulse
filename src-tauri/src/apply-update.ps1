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

function Stop-PulseMcpProcesses {
  # MCP uses the same image as the desktop app. Only that exact image in MCP
  # mode may be stopped; a matching filename or a substring is insufficient.
  Add-Type -AssemblyName System.Management
  if (!('PulseUpdateCommandLine' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PulseUpdateCommandLine {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int count);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr memory);
  public static bool IsMcp(string commandLine) {
    int count;
    IntPtr arguments = CommandLineToArgvW(commandLine, out count);
    if (arguments == IntPtr.Zero) throw new InvalidOperationException("Cannot inspect the Pulse MCP command line");
    try {
      for (int index = 1; index < count; index++) {
        string argument = Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments, index * IntPtr.Size));
        if (String.Equals(argument, "--mcp", StringComparison.Ordinal)) return true;
      }
      return false;
    } finally { LocalFree(arguments); }
  }
}
'@
  }
  $searcher = New-Object System.Management.ManagementObjectSearcher('SELECT Name, ProcessId, ExecutablePath, CommandLine, CreationDate FROM Win32_Process')
  try {
    $processes = $searcher.Get()
    try {
      foreach ($candidate in $processes) {
        if (![String]::Equals([string]$candidate.Name, [IO.Path]::GetFileName($destination), [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (!$candidate.ExecutablePath -or ![String]::Equals([IO.Path]::GetFullPath($candidate.ExecutablePath), $destination, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (!$candidate.CommandLine -or ![PulseUpdateCommandLine]::IsMcp($candidate.CommandLine)) { continue }
        try { $process = [Diagnostics.Process]::GetProcessById([int]$candidate.ProcessId) }
        catch [ArgumentException] { continue } # It exited after the snapshot.
        try {
          if ($process.HasExited) { continue }
          # A reused PID must not turn a stale MCP snapshot into another launch.
          $observedCreation = [Management.ManagementDateTimeConverter]::ToDateTime($candidate.CreationDate).ToUniversalTime()
          if ([Math]::Abs(($process.StartTime.ToUniversalTime() - $observedCreation).TotalMilliseconds) -ge 1) { continue }
          # Recheck the live image before acting on a PID from the WMI snapshot.
          if (![String]::Equals([IO.Path]::GetFullPath($process.MainModule.FileName), $destination, [StringComparison]::OrdinalIgnoreCase)) { continue }
          $process.Kill()
          if (!$process.WaitForExit(5000)) { throw 'Pulse MCP did not exit; existing version preserved' }
        } finally { $process.Dispose() }
      }
    } finally { $processes.Dispose() }
  } finally { $searcher.Dispose() }
}

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
    try {
      # A host may reconnect its MCP child while the update is being applied.
      Stop-PulseMcpProcesses
      Move-Item -LiteralPath $incoming -Destination $destination -Force
      $replaced = $true
      break
    }
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
  if ($replaced -and (Test-Path -LiteralPath $backup)) {
    Stop-PulseMcpProcesses
    Copy-Item -LiteralPath $backup -Destination $destination -Force
  }
  $pending = Join-Path $dataDirectory 'updates/pending.json'
  if (Test-Path -LiteralPath $pending) { Move-Item -LiteralPath $pending -Destination (Join-Path $dataDirectory 'updates/pending.failed.json') -Force }
  if (Test-Path -LiteralPath $update.health) { Remove-Item -LiteralPath $update.health -Force }
  if (Test-Path -LiteralPath $incoming) { Remove-Item -LiteralPath $incoming -Force }
  "Update failed: $failure. Previous executable restored; user data preserved." | Set-Content -LiteralPath (Join-Path $dataDirectory 'updates/result.txt')
  $env:PULSE_DATA_DIR = $dataDirectory
  Start-Process -FilePath $destination -WorkingDirectory (Split-Path -Parent $destination) -WindowStyle Hidden
  exit 1
}
