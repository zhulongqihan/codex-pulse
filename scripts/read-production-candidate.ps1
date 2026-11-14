param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$Archive
)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $Executable
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo($Executable).ProductVersion
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $entries = @($zip.Entries | ForEach-Object { $_.FullName })
  $entry = $zip.GetEntry('CodexPulse.exe')
  if ($null -eq $entry) { throw 'Portable executable is missing' }
  $stream = $entry.Open()
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $hasher.Dispose() }
} finally { $zip.Dispose() }
[ordered]@{
  productVersion = $version
  authenticodeStatus = $signature.Status.ToString()
  archiveEntries = $entries
  archiveExeSha256 = $hash
} | ConvertTo-Json -Depth 4 -Compress
