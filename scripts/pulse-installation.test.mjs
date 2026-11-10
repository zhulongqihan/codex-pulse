import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

// Real Windows COM/registry results, but only owned F-drive files and a unique fixture key.
test("Windows installation checks and selective repairs preserve unrelated bindings and disabled startup", { skip: process.platform !== "win32", timeout: 120_000 }, () => {
  const project = resolve(import.meta.dirname, "..");
  const parent = join(project, ".local", "tests");
  const root = join(parent, `installation-${randomUUID()}`);
  assert.match(root, /^[A-Za-z]:[\\/]/);
  const contained = relative(parent, root); assert.ok(contained && !contained.startsWith("..") && !isAbsolute(contained));
  mkdirSync(root, { recursive: true });
  const script = join(root, "fixture.ps1");
  writeFileSync(script, String.raw`param([string]$Root,[string]$Helper)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$rootFull=[IO.Path]::GetFullPath($Root)
if($rootFull -notmatch '^[A-Za-z]:\\' -or $rootFull -notmatch '\\\.local\\tests\\installation-[0-9a-f-]+$'){throw 'Unsafe fixture root'}
$registry='HKCU:\Software\CodexPulseInstallationFixture\'+[Guid]::NewGuid().ToString('N')
$cases=[Collections.Generic.List[string]]::new()
function Assert($Condition,[string]$Name){if(!$Condition){throw $Name};$cases.Add($Name)}
function Hash([string]$Path){$sha=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path)))}finally{$sha.Dispose()}}
function New-Link([string]$Directory,[string]$Target,[string]$Arguments=''){
 [void][IO.Directory]::CreateDirectory($Directory);$shell=New-Object -ComObject WScript.Shell
 try{$link=$shell.CreateShortcut((Join-Path $Directory 'Codex Pulse.lnk'));$link.TargetPath=$Target;$link.Arguments=$Arguments;$link.Description='Fixture description retained';$link.Save();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link)}finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
}
$current=Join-Path $Root 'new\CodexPulse.exe';$old=Join-Path $Root 'old\CodexPulse.exe';$other=Join-Path $Root 'other\CodexPulse.exe'
$desktop=Join-Path $Root 'Desktop';$programs=Join-Path $Root 'Programs'
foreach($path in @($current,$other)){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path));[IO.File]::WriteAllBytes($path,[byte[]]@(1,2,3))}
$options=@{Executable=$current;DesktopDirectory=$desktop;ProgramsDirectory=$programs;RunRegistryPath=($registry+'\Run');MachineRunRegistryPath=($registry+'\MachineRun');StartupApprovedPath=($registry+'\Approved');MachineStartupApprovedPath=($registry+'\MachineApproved')}
function Invoke-Helper([string]$Mode='Inspect',[string]$Id='',[string]$Stamp=''){
 $extra=@{};if($Mode -eq 'Repair'){$extra=@{ItemId=$Id;ExpectedStamp=$Stamp}}
 $raw=& $Helper @options -Mode $Mode @extra
 if($LASTEXITCODE -ne 0){throw 'Helper failed'}
 return ($raw|ConvertFrom-Json)
}
function Inspect {Invoke-Helper}
function Writable([string]$Name){[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(($registry.Substring(6)+'\'+$Name),$true)}
function Item($Check,[string]$Id){@($Check.entries|Where-Object id -eq $Id)[0]}
try {
 [void][IO.Directory]::CreateDirectory($desktop);[void][IO.Directory]::CreateDirectory($programs)
 $empty=Inspect
 Assert (@($empty.entries|Where-Object status -ne 'notConfigured').Count -eq 0) 'unconfigured entries are not broken'
 Assert (!(Test-Path -LiteralPath $registry)) 'read-only check creates no registry keys'
 Assert (@(Get-ChildItem -LiteralPath $desktop).Count -eq 0) 'read-only check creates no shortcut'
 $skipped=Invoke-Helper Repair startup (Item $empty startup).stateStamp
 Assert ($skipped.outcome -eq 'skipped' -and !(Test-Path -LiteralPath $registry)) 'repair never enables unconfigured startup'
 New-Link $desktop $old;New-Link $programs $other
 $desktopPath=Join-Path $desktop 'Codex Pulse.lnk';$menuPath=Join-Path $programs 'Codex Pulse.lnk'
 $beforeDesktop=Hash $desktopPath;$beforeMenu=Hash $menuPath
 $check=Inspect
 Assert ((Item $check desktop).status -eq 'stale' -and (Item $check desktop).canRepair) 'missing own shortcut target is repairable'
 Assert ((Item $check startMenu).status -eq 'otherInstallation' -and !(Item $check startMenu).canRepair) 'working other installation is preserved'
 Assert ((Hash $desktopPath) -eq $beforeDesktop -and (Hash $menuPath) -eq $beforeMenu) 'inspection preserves actual shortcut bytes'
 $repair=Invoke-Helper Repair desktop (Item $check desktop).stateStamp
 Assert ($repair.outcome -eq 'repaired' -and (Item (Inspect) desktop).status -eq 'current') 'selective shortcut repair changes real COM target'
 Assert ((Hash $menuPath) -eq $beforeMenu) 'selective repair preserves other shortcut bytes'
 $shell=New-Object -ComObject WScript.Shell
 try{$link=$shell.CreateShortcut($desktopPath);Assert ($link.Description -eq 'Fixture description retained') 'shortcut repair retains original description';[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link)}finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
 New-Link $desktop $old;$check=Inspect
 [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($old));[IO.File]::WriteAllBytes($old,[byte[]]@(9))
 $hash=Hash $desktopPath;$race=Invoke-Helper Repair desktop (Item $check desktop).stateStamp
 Assert ($race.outcome -eq 'changedSinceCheck' -and (Hash $desktopPath) -eq $hash) 'reappearing old installation rejects stale shortcut snapshot'
 [IO.File]::Delete($old)
 New-Link $desktop $old '--custom';$check=Inspect
 Assert (!(Item $check desktop).canRepair -and (Item $check desktop).detailCode -eq 'customized') 'custom shortcut arguments are not overwritten'
 foreach($name in @('Run','MachineRun','Approved','MachineApproved')){[void](New-Item -Path ($registry+'\'+$name) -Force)}
 $disabled=[byte[]]@(3,0,0,0,11,22,33,44,55,66,77,88)
 $run=Writable 'Run';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden'),[Microsoft.Win32.RegistryValueKind]::String);$run.SetValue('Unrelated','preserve');$run.Close()
 $approved=Writable 'Approved';$approved.SetValue('Codex Pulse',$disabled,[Microsoft.Win32.RegistryValueKind]::Binary);$approved.Close()
 $check=Inspect;$repair=Invoke-Helper Repair startup (Item $check startup).stateStamp
 Assert ($repair.outcome -eq 'repaired') 'stale existing Run target is repaired'
 $run=Writable 'Run';Assert ($run.GetValue('Codex Pulse') -ceq ('"'+$current+'" --hidden')) 'Run target uses exact current exe and hidden argument';Assert ($run.GetValue('Unrelated') -eq 'preserve') 'unrelated Run value retained';$run.Close()
 $approved=Writable 'Approved';Assert ([Convert]::ToBase64String($approved.GetValue('Codex Pulse')) -ceq [Convert]::ToBase64String($disabled)) 'Task Manager disabled bytes retained exactly';$approved.Close()
 $run=Writable 'Run';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden'));$run.Close();$check=Inspect
 $run=Writable 'Run';$run.SetValue('Codex Pulse',('"'+$other+'" --hidden'));$run.Close()
 $race=Invoke-Helper Repair startup (Item $check startup).stateStamp
 Assert ($race.outcome -eq 'changedSinceCheck') 'changed Run binding rejects old snapshot'
 $run=Writable 'Run';Assert ($run.GetValue('Codex Pulse') -ceq ('"'+$other+'" --hidden')) 'changed valid Run target retained';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden'));$run.Close()
 $machine=Writable 'MachineRun';$machine.SetValue('Codex Pulse',('"'+$other+'" --hidden'));$machine.Close();$check=Inspect
 Assert (!(Item $check startup).canRepair) 'machine binding prevents overwriting another valid installation'
 $machine=Writable 'MachineRun';Assert ($machine.GetValue('Codex Pulse') -ceq ('"'+$other+'" --hidden')) 'machine binding remains unchanged';$machine.DeleteValue('Codex Pulse');$machine.Close()
 $run=Writable 'Run';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden --extra'));$run.Close();$check=Inspect
 Assert (!(Item $check startup).canRepair) 'custom startup arguments are never rewritten'
 $run=Writable 'Run';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden'),[Microsoft.Win32.RegistryValueKind]::ExpandString);$run.Close();$check=Inspect
 $repair=Invoke-Helper Repair startup (Item $check startup).stateStamp
 $run=Writable 'Run';Assert ($run.GetValueKind('Codex Pulse') -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) 'startup repair preserves original registry value kind';$run.SetValue('Codex Pulse',('"'+$old+'" --hidden'));$run.Close();$check=Inspect
 $run=Writable 'Run';$run.DeleteValue('Codex Pulse');$run.Close();$race=Invoke-Helper Repair startup (Item $check startup).stateStamp
 $run=Writable 'Run';Assert ($race.outcome -eq 'changedSinceCheck' -and $run.GetValueNames() -inotcontains 'Codex Pulse') 'deleted startup is not recreated by stale repair';$run.Close()
 [IO.File]::Delete($desktopPath);[void][IO.Directory]::CreateDirectory($desktopPath);$check=Inspect
 Assert ((Item $check desktop).status -eq 'unavailable' -and (Item $check startMenu).status -eq 'otherInstallation') 'unreadable individual entry preserves other inspection results'
 @{passed=$true;cases=$cases;registryFixture=$registry;userBindingsChanged=$false}|ConvertTo-Json -Depth 5 -Compress
}finally{
 if($registry -notmatch '^HKCU:\\Software\\CodexPulseInstallationFixture\\[0-9a-f]{32}$'){throw 'Unsafe registry cleanup'}
 if(Test-Path -LiteralPath $registry){Remove-Item -LiteralPath $registry -Recurse -Force}
}
`, "utf8");
  let result;
  try {
    const powershell = join(process.env.WINDIR || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const output = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Root", root, "-Helper", join(project, "scripts", "pulse-installation.ps1")], { encoding: "utf8", timeout: 110_000, windowsHide: true });
    result = JSON.parse(output.trim()); assert.equal(result.passed, true); assert.ok(result.cases.length >= 20); assert.equal(result.userBindingsChanged, false);
  } catch (error) {
    if (error.stdout) console.error(String(error.stdout)); if (error.stderr) console.error(String(error.stderr)); throw error;
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.equal(existsSync(root), false);
  const evidence = process.env.PULSE_INSTALLATION_TEST_REPORT;
  if (evidence) { assert.match(resolve(evidence), /^[Ff]:[\\/]/); mkdirSync(resolve(evidence, ".."), { recursive: true }); writeFileSync(evidence, JSON.stringify({ ...result, cleanupConfirmed: true }, null, 2) + "\n"); }
});
