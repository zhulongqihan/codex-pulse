param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../.local/update-verification'))
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$env:TEMP = Join-Path $root 'tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$compiler = Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The existing .NET Framework C# compiler is required for this Windows fixture.' }
$helper = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/src/apply-update.ps1'))
$powershell = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32/WindowsPowerShell/v1.0/powershell.exe'
$reports = [Collections.Generic.List[object]]::new()

function Assert-That([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}

function Compile-Fixture([string]$Destination, [string]$Version, [bool]$Fail) {
    $source = [IO.Path]::ChangeExtension($Destination, '.cs')
    $failLiteral = if ($Fail) { 'true' } else { 'false' }
    $program = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
internal static class PulseUpdateFixture {
    static int Main(string[] args) {
        string data = Environment.GetEnvironmentVariable("PULSE_DATA_DIR");
        string version = "$Version";
        string evidence = Path.Combine(data, version + ".started.txt");
        File.AppendAllText(evidence, Process.GetCurrentProcess().MainModule.FileName + "|" + Environment.CurrentDirectory + "|" + data + "\n");
        if (Boolean.Parse("$failLiteral")) return 2;
        if (args.Length == 0) File.WriteAllText(Path.Combine(data, "updates", "healthy"), version);
        for (int i = 0; i < 300; i++) {
            if (File.Exists(Path.Combine(data, args.Length > 0 ? "close-initial" : "close-restarted"))) return 0;
            Thread.Sleep(100);
        }
        return 0;
    }
}
"@
    [IO.File]::WriteAllText($source, $program, [Text.UTF8Encoding]::new($false))
    & $compiler /nologo /target:winexe /optimize+ "/out:$Destination" $source
    if ($LASTEXITCODE -ne 0) { throw 'Fixture executable compilation failed' }
}

foreach ($scenario in @('success', 'startup-failure', 'tampered-package')) {
    $directory = Join-Path $root ($scenario + '-' + [Guid]::NewGuid().ToString('N'))
    $installation = Join-Path $directory 'Portable app with spaces'
    $data = Join-Path $installation 'data'
    $updates = Join-Path $data 'updates'
    New-Item -ItemType Directory -Path $updates -Force | Out-Null
    $destination = Join-Path $installation 'codex-pulse.exe'
    $package = Join-Path $updates 'pending.exe'
    Compile-Fixture $destination '0.3.0' $false
    Compile-Fixture $package '0.4.0' ($scenario -eq 'startup-failure')
    $oldHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    $newHash = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash
    'retained source-independent user data' | Set-Content -LiteralPath (Join-Path $data 'do-not-delete.txt')
    '{}' | Set-Content -LiteralPath (Join-Path $updates 'pending.json')
    $env:PULSE_DATA_DIR = $data
    $oldProcess = Start-Process -FilePath $destination -ArgumentList 'initial' -WorkingDirectory $installation -WindowStyle Hidden -PassThru
    $config = Join-Path $updates 'apply-update.json'
    $descriptor = @{ executable = $destination; package = $package; dataDir = $data; health = (Join-Path $updates 'healthy'); version = '0.4.0'; sha256 = $newHash; processId = $oldProcess.Id }
    if ($scenario -eq 'tampered-package') { $descriptor.sha256 = '0' * 64 }
    $descriptor | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
    try {
        $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $helper + '"'), '-ConfigPath', ('"' + $config + '"'))
        $updateProcess = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directory 'stdout.txt') -RedirectStandardError (Join-Path $directory 'stderr.txt')
        'exit' | Set-Content -LiteralPath (Join-Path $data 'close-initial')
        Assert-That ($updateProcess.WaitForExit(45000)) "Update helper timed out: $scenario"
        $updateProcess.Refresh()
        $exitCode = $updateProcess.ExitCode
        $resultHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        $expectedHash = if ($scenario -eq 'success') { $newHash } else { $oldHash }
        Assert-That ($resultHash -eq $expectedHash) "Wrong executable after $scenario"
        Assert-That ((Get-Content -LiteralPath (Join-Path $data 'do-not-delete.txt') -Raw).Trim() -eq 'retained source-independent user data') "User data changed during $scenario"
        Assert-That (($scenario -eq 'success' -and $exitCode -eq 0) -or ($scenario -ne 'success' -and $exitCode -ne 0)) "Unexpected helper exit code $exitCode during $scenario"
        $version = if ($scenario -eq 'success') { '0.4.0' } else { '0.3.0' }
        $startedFile = Join-Path $data ($version + '.started.txt')
        $expectedLine = $destination + '|' + $installation + '|' + $data
        $started = @()
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-Path -LiteralPath $startedFile) { $started = @(Get-Content -LiteralPath $startedFile) }
            $expectedCount = if ($version -eq '0.3.0') { 2 } else { 1 }
            if (@($started | Where-Object { $_ -eq $expectedLine }).Count -ge $expectedCount) { break }
            Start-Sleep -Milliseconds 100
        }
        Assert-That (@($started | Where-Object { $_ -eq $expectedLine }).Count -ge $expectedCount) "Application did not restart from the original portable directory after $scenario"
        Assert-That (Test-Path -LiteralPath (Join-Path $updates 'result.txt')) "No durable update result for $scenario"
        Assert-That (!(Test-Path -LiteralPath (Join-Path $updates 'pending.json'))) "Update would repeat on the next restart after $scenario"
        $reports.Add([pscustomobject]@{ scenario = $scenario; passed = $true; exitCode = $exitCode; executableSha256 = $resultHash.ToLowerInvariant(); originalDirectory = $installation; dataPreserved = $true; result = (Get-Content -LiteralPath (Join-Path $updates 'result.txt') -Raw).Trim() })
    } finally {
        'exit' | Set-Content -LiteralPath (Join-Path $data 'close-restarted')
        if (!$oldProcess.HasExited) { Stop-Process -Id $oldProcess.Id -Force -ErrorAction SilentlyContinue }
        if ($updateProcess -and !$updateProcess.HasExited) { Stop-Process -Id $updateProcess.Id -Force -ErrorAction SilentlyContinue }
    }
}
$reports | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'results.json') -Encoding UTF8
$reports | Format-Table scenario,passed,exitCode,dataPreserved -AutoSize
