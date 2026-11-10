param(
 [ValidateSet('Inspect','Repair')][string]$Mode='Inspect',
 [Parameter(Mandatory=$true)][string]$Executable,
 [string]$AppName='Codex Pulse',
 [string]$DesktopDirectory=[Environment]::GetFolderPath('Desktop'),
 [string]$ProgramsDirectory=[Environment]::GetFolderPath('Programs'),
 [string]$RunRegistryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
 [string]$MachineRunRegistryPath='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
 [string]$StartupApprovedPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
 [string]$MachineStartupApprovedPath='HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
 [ValidateSet('desktop','startMenu','startup')][string]$ItemId,
 [string]$ExpectedStamp
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$current=[IO.Path]::GetFullPath($Executable)
$installation=[IO.Path]::GetDirectoryName($current)
function Digest([byte[]]$Bytes){$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function Stamp($Value){Digest ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 9 -Compress)))}
function Local-Path([string]$Path){return ![String]::IsNullOrWhiteSpace($Path) -and $Path -match '^[A-Za-z]:[\\/]'}
function Same-Path([string]$A,[string]$B){if(!(Local-Path $A)-or !(Local-Path $B)){return $false};return [String]::Equals([IO.Path]::GetFullPath($A).TrimEnd('\'),[IO.Path]::GetFullPath($B).TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)}
function Pulse-Name([string]$Path){return @('CodexPulse.exe','codex-pulse.exe') -icontains [IO.Path]::GetFileName($Path)}
function Base-Entry([string]$Id,[string]$Location){return [ordered]@{id=$Id;location=$Location;targetPath=$null;status='unavailable';canRepair=$false;detailCode='unreadable';stateStamp=''}}
function Read-Shortcut([string]$Id,[string]$Directory){
 $path=Join-Path $Directory 'Codex Pulse.lnk';$entry=Base-Entry $Id $path
 if(!(Test-Path -LiteralPath $path)){ $entry.status='notConfigured';$entry.detailCode='notConfigured';$entry.stateStamp=Stamp (@($Id,'missing'));return $entry }
 $file=Get-Item -LiteralPath $path -Force
 if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){ $entry.detailCode='customized';$entry.stateStamp=Stamp (@($Id,'unexpected'));return $entry }
 $shell=New-Object -ComObject WScript.Shell
 try {
  $link=$shell.CreateShortcut($path);$target=[Environment]::ExpandEnvironmentVariables($link.TargetPath);$entry.targetPath=$target
  $exists=(Local-Path $target) -and (Test-Path -LiteralPath $target -PathType Leaf)
  $raw=[ordered]@{hash=Digest ([IO.File]::ReadAllBytes($path));target=$link.TargetPath;arguments=$link.Arguments;working=$link.WorkingDirectory;icon=$link.IconLocation;targetExists=$exists}
  $entry.stateStamp=Stamp $raw
  if(!(Local-Path $target) -or !(Pulse-Name $target) -or ![String]::IsNullOrEmpty($link.Arguments)){ $entry.detailCode='customized';return $entry }
  if(![String]::IsNullOrEmpty($link.WorkingDirectory) -and !(Same-Path $link.WorkingDirectory ([IO.Path]::GetDirectoryName($target)))){$entry.detailCode='customized';return $entry}
  if(Same-Path $target $current){$entry.status='current';$entry.detailCode='current'}
  elseif($exists){$entry.status='otherInstallation';$entry.detailCode='otherInstallation'}
  else{$entry.status='stale';$entry.canRepair=$true;$entry.detailCode='missingTarget'}
  return $entry
 } finally {if($null -ne $link){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link)};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
}
function Registry-Value([string]$Path){
 if(!(Test-Path -LiteralPath $Path)){return $null}
 $key=Get-Item -LiteralPath $Path
 try{if($key.GetValueNames() -inotcontains $AppName){return $null};$value=$key.GetValue($AppName,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);return [ordered]@{kind=$key.GetValueKind($AppName).ToString();value=$value}}finally{$key.Close()}
}
function Open-ExistingUser-Key([string]$Path){
 $read=Get-Item -LiteralPath $Path
 try{$name=$read.Name}finally{$read.Close()}
 $prefix='HKEY_CURRENT_USER\'
 if(!$name.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Only an existing per-user Run value may be repaired'}
 $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($name.Substring($prefix.Length),$true)
 if($null -eq $key){throw 'Existing Run key is unavailable'}
 return $key
}
function Parse-Run($Value){
 if($null -eq $Value -or $Value.kind -notin @('String','ExpandString') -or $Value.value -isnot [string]){return $null}
 $m=[Regex]::Match($Value.value,'^\s*(?:"(?<path>[^"]+)"|(?<path>\S+))\s+(?<arg>--hidden)\s*$')
 if(!$m.Success){return $null};$target=[Environment]::ExpandEnvironmentVariables($m.Groups['path'].Value)
 if(!(Local-Path $target)-or !(Pulse-Name $target)){return $null};return [ordered]@{target=$target;exists=(Test-Path -LiteralPath $target -PathType Leaf)}
}
function Read-Startup {
 $entry=Base-Entry 'startup' ($RunRegistryPath+'\'+$AppName)
 $user=Registry-Value $RunRegistryPath;$machine=Registry-Value $MachineRunRegistryPath
 $approved=Registry-Value $StartupApprovedPath;$machineApproved=Registry-Value $MachineStartupApprovedPath
 $parsed=Parse-Run $user;$other=Parse-Run $machine
 $entry.stateStamp=Stamp (@($user,$machine,$approved,$machineApproved,$parsed,$other))
 if($null -eq $user){if($null -eq $machine){$entry.status='notConfigured';$entry.detailCode='notConfigured'}else{$entry.targetPath=if($other){$other.target}else{$null};$entry.detailCode='machineStartup';$entry.status=if($other -and (Same-Path $other.target $current)){'current'}elseif($other -and $other.exists){'otherInstallation'}else{'unavailable'}};return $entry}
 if($null -eq $parsed){$entry.detailCode='customized';return $entry}
 $entry.targetPath=$parsed.target
 if($null -ne $machine){$entry.detailCode='machineStartup';$entry.status=if((Same-Path $parsed.target $current)-and (!$other -or (Same-Path $other.target $current))){'current'}else{'otherInstallation'};return $entry}
 if(Same-Path $parsed.target $current){$entry.status='current';$entry.detailCode='current'}
 elseif($parsed.exists){$entry.status='otherInstallation';$entry.detailCode='otherInstallation'}
 else{$entry.status='stale';$entry.canRepair=$true;$entry.detailCode='startupPathOnly'}
 return $entry
}
function Read-One([string]$Id){try{switch($Id){desktop {Read-Shortcut $Id $DesktopDirectory} startMenu {Read-Shortcut $Id $ProgramsDirectory} startup {Read-Startup}}}catch{$entry=Base-Entry $Id ''; $entry.stateStamp=Stamp (@($Id,'unreadable'));return $entry}}
if($Mode -eq 'Inspect'){@{entries=@('desktop','startMenu','startup'|ForEach-Object{Read-One $_})}|ConvertTo-Json -Depth 7 -Compress;exit 0}
if(!$ItemId -or $ExpectedStamp -notmatch '^[a-f0-9]{64}$'){throw 'A checked entry and its snapshot are required'}
$entry=Read-One $ItemId
if($entry.stateStamp -cne $ExpectedStamp){@{outcome='changedSinceCheck';detailCode='changedSinceCheck'}|ConvertTo-Json -Compress;exit 0}
if(!$entry.canRepair){@{outcome='skipped';detailCode=$entry.detailCode}|ConvertTo-Json -Compress;exit 0}
if(!(Test-Path -LiteralPath $current -PathType Leaf)){throw 'Current executable is missing'}
if($ItemId -eq 'startup'){
 # Never call autostart.enable(): it also enables StartupApproved. Only update this existing Run string.
 $before=Registry-Value $RunRegistryPath
 if($null -eq $before -or (Read-One $ItemId).stateStamp -cne $ExpectedStamp){@{outcome='changedSinceCheck';detailCode='changedSinceCheck'}|ConvertTo-Json -Compress;exit 0}
 $key=Open-ExistingUser-Key $RunRegistryPath
 try{
  if($key.GetValueNames() -inotcontains $AppName -or (Read-One $ItemId).stateStamp -cne $ExpectedStamp){@{outcome='changedSinceCheck';detailCode='changedSinceCheck'}|ConvertTo-Json -Compress;exit 0}
  $kind=[Enum]::Parse([Microsoft.Win32.RegistryValueKind],$before.kind);$key.SetValue($AppName,('"'+$current+'" --hidden'),$kind)
 }finally{$key.Close()}
}else{
 $path=$entry.location;$stage=Join-Path ([IO.Path]::GetDirectoryName($path)) ('.Pulse-repair-'+[Guid]::NewGuid().ToString('N')+'.lnk')
 $shell=New-Object -ComObject WScript.Shell
 try{
  [IO.File]::Copy($path,$stage,$false);$link=$shell.CreateShortcut($stage)
  $oldTarget=$link.TargetPath;$oldIcon=($link.IconLocation -replace ',[-0-9]+$','').Trim('"')
  $link.TargetPath=$current;$link.WorkingDirectory=$installation
  if([String]::IsNullOrEmpty($oldIcon) -or (Same-Path $oldIcon $oldTarget)){$link.IconLocation=$current+',0'}
  $link.Save();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link);$link=$null
  if((Read-One $ItemId).stateStamp -cne $ExpectedStamp){@{outcome='changedSinceCheck';detailCode='changedSinceCheck'}|ConvertTo-Json -Compress;exit 0}
  [IO.File]::Replace($stage,$path,[NullString]::Value)
 }finally{if($null -ne $link){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link)};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell);if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Force}}
}
$after=Read-One $ItemId
if($after.status -ne 'current'){throw 'Windows did not confirm the repaired entry'}
@{outcome='repaired';detailCode=if($ItemId -eq 'startup'){'startupPathOnly'}else{'repaired'}}|ConvertTo-Json -Compress
