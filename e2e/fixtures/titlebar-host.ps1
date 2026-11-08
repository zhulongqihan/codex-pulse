param([Parameter(Mandatory=$true)][string]$OutputDirectory, [switch]$Start)
$ErrorActionPreference = 'Stop'
if (![IO.Path]::IsPathRooted($OutputDirectory)) { throw 'The synthetic fixture directory must be absolute.' }
$directory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$source = Join-Path $directory 'pulse-titlebar-fixture.cs'
$executable = Join-Path $directory 'pulse-titlebar-fixture.exe'
@'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// An owned native test window. It never targets another application or runs a shell command.
public static class PulseTitlebarFixture {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct WndClass {
        public uint style; public WndProc proc; public int classExtra, windowExtra;
        public IntPtr instance, icon, cursor, background; public string menu, name;
    }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
    delegate IntPtr WndProc(IntPtr window,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClassW(ref WndClass value);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(uint ex,string name,string title,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProcW(IntPtr window,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern void PostQuitMessage(int exitCode);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint first,uint second,bool attach);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    static WndProc procedure = WindowProcedure;
    static IntPtr host, other;
    static string directory, lastId = "";
    static JavaScriptSerializer serializer = new JavaScriptSerializer();
    static DateTime started = DateTime.UtcNow;
    static HashSet<string> registered = new HashSet<string>();
    static IntPtr WindowProcedure(IntPtr window,uint message,IntPtr w,IntPtr l) {
        if(message==0x10) { if(window==host) PostQuitMessage(0); else ShowWindow(window,0); return IntPtr.Zero; }
        return DefWindowProcW(window,message,w,l);
    }
    static IntPtr Create(string name,string title,int x,int y) {
        WndClass value = new WndClass(); value.proc=procedure; value.name=name; value.background=new IntPtr(6);
        if(!registered.Contains(name)) {
            if(RegisterClassW(ref value)==0) throw new Exception("Cannot register the synthetic window class");
            registered.Add(name);
        }
        IntPtr result=CreateWindowExW(0,name,title,0x00CF0000,x,y,1280,800,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
        if(result==IntPtr.Zero) throw new Exception("Cannot create the synthetic window");
        return result;
    }
    static int Number(Dictionary<string,object> value,string key,int fallback) { return value.ContainsKey(key)?Convert.ToInt32(value[key]):fallback; }
    static void Activate(IntPtr window) {
        uint process; uint thread=GetWindowThreadProcessId(GetForegroundWindow(),out process); uint current=GetCurrentThreadId();
        if(thread!=0 && thread!=current) AttachThreadInput(current,thread,true);
        try { SetForegroundWindow(window); } finally { if(thread!=0 && thread!=current) AttachThreadInput(current,thread,false); }
    }
    static void Tick(object sender,EventArgs args) {
        if(DateTime.UtcNow-started>TimeSpan.FromMinutes(10)) { PostQuitMessage(0); return; }
        string command=Path.Combine(directory,"command.json");
        try {
            if(File.Exists(command)) {
                Dictionary<string,object> value=serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(command));
                string id=Convert.ToString(value["id"]);
                if(id!=lastId) {
                    string action=Convert.ToString(value["action"]);
                    if(action=="move") SetWindowPos(host,IntPtr.Zero,Number(value,"x",120),Number(value,"y",100),Number(value,"width",1280),Number(value,"height",800),0x0010|0x0004);
                    else if(action=="minimize") ShowWindow(host,6);
                    else if(action=="maximize") { ShowWindow(host,3); Activate(host); }
                    else if(action=="restore") { ShowWindow(host,9); Activate(host); }
                    else if(action=="activate") { ShowWindow(host,1); Activate(host); }
                    else if(action=="focus-other") { ShowWindow(other,1); Activate(other); }
                    else if(action=="close-host") { DestroyWindow(host); host=IntPtr.Zero; }
                    else if(action=="reopen") { if(host==IntPtr.Zero) host=Create("PulseTitlebarTestHost","Pulse synthetic Codex host",120,100); ShowWindow(host,1); Activate(host); }
                    else if(action=="stop") PostQuitMessage(0);
                    lastId=id;
                }
            }
            Rect rect; GetWindowRect(host,out rect);
            Dictionary<string,object> state=new Dictionary<string,object> {
                {"processId",System.Diagnostics.Process.GetCurrentProcess().Id},{"window",host.ToInt64()},
                {"otherWindow",other.ToInt64()},{"commandId",lastId},{"foreground",GetForegroundWindow()==host},
                {"minimized",IsIconic(host)},{"dpi",GetDpiForWindow(host)},
                {"x",rect.left},{"y",rect.top},{"width",rect.right-rect.left},{"height",rect.bottom-rect.top}
            };
            File.WriteAllText(Path.Combine(directory,"state.tmp"),serializer.Serialize(state));
            string path=Path.Combine(directory,"state.json");
            if(File.Exists(path)) File.Delete(path);
            File.Move(Path.Combine(directory,"state.tmp"),path);
        } catch(IOException) { } catch(ArgumentException) { } catch(KeyNotFoundException) { } catch(NullReferenceException) { }
    }
    [STAThread] public static void Main(string[] args) {
        if(args.Length!=1 || !Path.IsPathRooted(args[0])) return;
        directory=Path.GetFullPath(args[0]); Directory.CreateDirectory(directory);
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        host=Create("PulseTitlebarTestHost","Pulse synthetic Codex host",120,100);
        // A browser-like class alone must never establish Codex identity.
        other=Create("Chrome_WidgetWin_1","Pulse synthetic unrelated browser window",150,130);
        ShowWindow(host,1); Activate(host);
        System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();timer.Interval=75;timer.Tick+=Tick;timer.Start();
        Application.Run();
    }
}
'@ | Set-Content -LiteralPath $source -Encoding UTF8
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler is unavailable for the synthetic fixture.' }
& $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/out:$executable" $source
if ($LASTEXITCODE -ne 0) { throw 'The synthetic titlebar fixture failed to compile.' }
$result=[ordered]@{executable=$executable;controlDirectory=$directory;processId=$null}
if ($Start) {
    $process=Start-Process -FilePath $executable -ArgumentList ('"'+$directory+'"') -PassThru -WindowStyle Hidden
    $result.processId=$process.Id
}
$result | ConvertTo-Json -Compress
