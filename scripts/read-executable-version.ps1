param([Parameter(Mandatory = $true)][string]$Executable)

$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding
$executablePath = [IO.Path]::GetFullPath($Executable)
if (!(Test-Path -LiteralPath $executablePath -PathType Leaf) -or [IO.Path]::GetExtension($executablePath) -ine '.exe') {
  throw 'A Windows executable is required for product-version verification.'
}
$productVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($executablePath).ProductVersion
if ([string]::IsNullOrWhiteSpace($productVersion)) {
  throw 'The executable does not have a ProductVersion resource.'
}
[PSCustomObject]@{ productVersion = $productVersion } | ConvertTo-Json -Compress
