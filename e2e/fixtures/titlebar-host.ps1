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
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public uint size; public Rect monitor,work; public uint flags; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int x,y; public Point(int px,int py){x=px;y=py;} }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x,y;public uint data,flags,time;public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit,Size=40)] struct Input { [FieldOffset(0)] public uint type;[FieldOffset(8)] public Mouse mouse; }
    delegate IntPtr WndProc(IntPtr window,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClassW(ref WndClass value);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(uint ex,string name,string title,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProcW(IntPtr window,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] static extern uint SendInput(uint count,Input[] inputs,int size);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr window,StringBuilder text,int capacity);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtrW(IntPtr window,int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtrW(IntPtr window,int index,IntPtr value);
    delegate bool EnumProc(IntPtr window,IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc procedure,IntPtr parameter);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfoW(IntPtr monitor,ref MonitorInfo info);
    [DllImport("user32.dll")] static extern void PostQuitMessage(int exitCode);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint first,uint second,bool attach);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint process);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,StringBuilder path,ref uint length);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
    static WndProc procedure = WindowProcedure;
    static IntPtr host, other;
    static string directory, lastId = "";
    static string commandError="";
    static int physicalBadgeClicks=0;
    static bool pendingPhysicalClick=false;
    static bool pendingMotion=false;
    static System.Windows.Forms.Timer releaseTimer;
    static JavaScriptSerializer serializer = new JavaScriptSerializer();
    static DateTime started = DateTime.UtcNow;
    static HashSet<string> registered = new HashSet<string>();
    static IntPtr WindowProcedure(IntPtr window,uint message,IntPtr w,IntPtr l) {
        if(message==0x10) { if(window==host) PostQuitMessage(0); else ShowWindow(window,0); return IntPtr.Zero; }
        return DefWindowProcW(window,message,w,l);
    }
    static Rect WorkArea(IntPtr window) {
        MonitorInfo info=new MonitorInfo();info.size=(uint)Marshal.SizeOf(typeof(MonitorInfo));
        if(!GetMonitorInfoW(MonitorFromWindow(window,2),ref info)) throw new Exception("Cannot inspect the synthetic host monitor work area");
        return info.work;
    }
    static IntPtr Create(string name,string title,int x,int y) {
        WndClass value = new WndClass(); value.proc=procedure; value.name=name; value.background=new IntPtr(6);
        if(!registered.Contains(name)) {
            if(RegisterClassW(ref value)==0) throw new Exception("Cannot register the synthetic window class");
            registered.Add(name);
        }
        Rect work=WorkArea(IntPtr.Zero);
        int width=Math.Min(1280,(int)((work.right-work.left)*0.86));
        int height=Math.Min(800,(int)((work.bottom-work.top)*0.82));
        x=Math.Max(work.left+8,Math.Min(x,work.right-width-8));
        y=Math.Max(work.top+8,Math.Min(y,work.bottom-height-8));
        IntPtr result=CreateWindowExW(0,name,title,0x00CF0000,x,y,width,height,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
        if(result==IntPtr.Zero) throw new Exception("Cannot create the synthetic window");
        return result;
    }
    static int Number(Dictionary<string,object> value,string key,int fallback) { return value.ContainsKey(key)?Convert.ToInt32(value[key]):fallback; }
    static void Activate(IntPtr window) {
        uint process; uint thread=GetWindowThreadProcessId(GetForegroundWindow(),out process); uint current=GetCurrentThreadId();
        if(thread!=0 && thread!=current) AttachThreadInput(current,thread,true);
        try { SetForegroundWindow(window); } finally { if(thread!=0 && thread!=current) AttachThreadInput(current,thread,false); }
    }
    static bool ExpectedDebugWindow(IntPtr window,string expectedTitle,string expected) {
        if(window==IntPtr.Zero || !IsWindowVisible(window))return false;
        StringBuilder title=new StringBuilder(128);GetWindowTextW(window,title,128);
        if(title.ToString()!=expectedTitle)return false;
        uint process;GetWindowThreadProcessId(window,out process);
        IntPtr handle=OpenProcess(0x1000,false,process);if(handle==IntPtr.Zero)return false;
        try {
            uint length=32768;StringBuilder path=new StringBuilder(32768);
            return QueryFullProcessImageNameW(handle,0,path,ref length)&&String.Equals(Path.GetFullPath(path.ToString()),Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase);
        } finally { CloseHandle(handle); }
    }
    static string ClickBadge(int x,int y,bool fromOwnedPopup) {
        // This fixture may inject one click only over its own expected debug app.
        // A user's real Codex or any unrelated foreground window is rejected.
        string expected=Environment.GetEnvironmentVariable("PULSE_TITLEBAR_EXPECTED_APP_BINARY");
        if(String.IsNullOrEmpty(expected)||!Path.IsPathRooted(expected)||!File.Exists(expected))return "expected_debug_image_missing";
        IntPtr origin=GetForegroundWindow();
        if(IsIconic(host)||!IsWindowVisible(host))return "fixture_host_not_visible";
        if(!fromOwnedPopup && origin!=host)return "fixture_host_not_foreground";
        if(fromOwnedPopup && !ExpectedDebugWindow(origin,"Codex Pulse \u00b7 Pace",expected))return "owned_debug_popup_not_foreground";
        IntPtr badge=GetAncestor(WindowFromPoint(new Point(x,y)),2);
        if(!ExpectedDebugWindow(badge,"Codex Pulse \u00b7 Titlebar",expected))return "point_is_not_expected_debug_badge";
        if(!SetCursorPos(x,y))return "pointer_position_failed";
        if(GetForegroundWindow()!=origin || GetAncestor(WindowFromPoint(new Point(x,y)),2)!=badge)return "foreground_or_hit_changed";
        if(SendInput(1,new Input[]{new Input{type=0,mouse=new Mouse{flags=2}}},Marshal.SizeOf(typeof(Input)))!=1)return "physical_down_rejected";
        pendingPhysicalClick=true;
        // Pump the fixture's GUI queue while the target receives its activation.
        // A same-batch down/up can be eaten by an initially unfocused WebView.
        releaseTimer=new System.Windows.Forms.Timer();releaseTimer.Interval=80;
        releaseTimer.Tick+=delegate(object sender,EventArgs args) {
            releaseTimer.Stop();releaseTimer.Dispose();
            IntPtr foreground=GetForegroundWindow();
            bool safe=(foreground==origin||foreground==badge)&&GetAncestor(WindowFromPoint(new Point(x,y)),2)==badge&&ExpectedDebugWindow(badge,"Codex Pulse \u00b7 Titlebar",expected);
            if(!safe)commandError="foreground_or_hit_changed_before_release";
            // Always release an already injected button; no second down is sent.
            bool released=SendInput(1,new Input[]{new Input{type=0,mouse=new Mouse{flags=4}}},Marshal.SizeOf(typeof(Input)))==1;
            if(!released)commandError="physical_up_rejected";
            if(safe&&released)physicalBadgeClicks++;
            pendingPhysicalClick=false;
        };
        releaseTimer.Start();
        return "";
    }
    static IntPtr DebugBadge() {
        string expected=Environment.GetEnvironmentVariable("PULSE_TITLEBAR_EXPECTED_APP_BINARY");
        if(String.IsNullOrEmpty(expected))throw new Exception("expected_debug_image_missing");
        IntPtr found=IntPtr.Zero;
        EnumWindows(delegate(IntPtr window,IntPtr parameter) {
            if(ExpectedDebugWindow(window,"Codex Pulse \u00b7 Titlebar",expected)) { found=window;return false; }
            return true;
        },IntPtr.Zero);
        if(found==IntPtr.Zero)throw new Exception("expected_debug_badge_missing");
        return found;
    }
    static double ProcessCpuMs(IntPtr process) {
        long created,exited,kernel,user;
        if(!GetProcessTimes(process,out created,out exited,out kernel,out user))throw new Exception("Cannot read owned app CPU time");
        return (kernel+user)/10000.0;
    }
    static void MeasureFollow() {
        if(pendingMotion)throw new Exception("motion_probe_already_running");
        if(GetForegroundWindow()!=host)throw new Exception("owned_host_not_foreground_for_motion");
        IntPtr badge=DebugBadge();
        uint processId;GetWindowThreadProcessId(badge,out processId);
        IntPtr app=OpenProcess(0x1000,false,processId);
        if(app==IntPtr.Zero)throw new Exception("owned_debug_cpu_handle_unavailable");
        Rect frame,work=WorkArea(host);GetWindowRect(host,out frame);
        int width=frame.right-frame.left,height=frame.bottom-frame.top;
        int startX=work.left+16,travel=Math.Min(240,work.right-startX-width-16);
        if(travel<64)throw new Exception("work_area_too_small_for_motion_probe");
        SetWindowPos(host,IntPtr.Zero,startX,frame.top,width,height,0x0010|0x0004);
        pendingMotion=true;
        System.Diagnostics.Stopwatch watch=System.Diagnostics.Stopwatch.StartNew();
        double idleStart=ProcessCpuMs(app),motionStart=0;
        double motionAt=0,finalAt=0;int step=0,offset=0,previousBadgeX=Int32.MinValue,updates=0;
        bool moving=false,finished=false;
        List<Dictionary<string,object>> requests=new List<Dictionary<string,object>>();
        List<Dictionary<string,object>> samples=new List<Dictionary<string,object>>();
        List<double> latencies=new List<double>();
        double idlePercent=0;
        System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();timer.Interval=16;
        Action<string> finish=delegate(string failure) {
            if(finished)return;finished=true;timer.Stop();timer.Dispose();pendingMotion=false;
            double elapsed=watch.Elapsed.TotalMilliseconds;
            double cpu=ProcessCpuMs(app);
            double activeMs=Math.Max(1,elapsed-motionAt);
            double motionPercent=moving?(cpu-motionStart)/activeMs*100:0;
            List<double> sorted=new List<double>(latencies);sorted.Sort();
            double p95=sorted.Count>0?sorted[(int)Math.Floor((sorted.Count-1)*0.95)]:-1;
            double max=sorted.Count>0?sorted[sorted.Count-1]:-1;
            Rect currentHost,currentBadge;GetWindowRect(host,out currentHost);GetWindowRect(badge,out currentBadge);
            bool finalAligned=moving&&step==64&&currentBadge.left==currentHost.left+offset;
            Dictionary<string,object> result=new Dictionary<string,object> {
                {"scope","Owned synthetic host only; no user host input or movement"},
                {"passed",failure==""&&finalAligned&&updates>=16&&p95<=100&&max<=200&&motionPercent<80},
                {"failure",failure},{"hostMoves",step},{"badgeUpdates",updates},{"samples",samples},
                {"requests",requests},{"p95ObservedLagMs",p95},{"maxObservedLagMs",max},
                {"sampleIntervalRequestedMs",16},{"finalAligned",finalAligned},{"finalSettleMs",moving?elapsed-finalAt:-1},
                {"idleOneCoreCpuPercent",idlePercent},{"motionOneCoreCpuPercent",motionPercent},
                {"cpuSource","GetProcessTimes kernel+user; native app process only, excludes WebView subprocesses"},
                {"idleCpuMs",motionStart-idleStart},{"motionCpuMs",cpu-motionStart},
                {"motionDurationMs",moving?activeMs:0},{"foregroundPreserved",GetForegroundWindow()==host}
            };
            File.WriteAllText(Path.Combine(directory,"motion.json"),serializer.Serialize(result));
            if(failure!="")commandError=failure;
            CloseHandle(app);
        };
        timer.Tick+=delegate(object sender,EventArgs args) {
            try {
                if(GetForegroundWindow()!=host) { finish("foreground_changed_during_owned_motion");return; }
                double now=watch.Elapsed.TotalMilliseconds;
                if(!moving) {
                    if(now<1000)return;
                    Rect baseline;GetWindowRect(badge,out baseline);GetWindowRect(host,out frame);
                    if(!IsWindowVisible(badge)) { finish("badge_hidden_before_motion");return; }
                    offset=baseline.left-frame.left;previousBadgeX=baseline.left;
                    motionStart=ProcessCpuMs(app);idlePercent=(motionStart-idleStart)/now*100;
                    motionAt=now;moving=true;
                }
                if(step<64) {
                    step++;int x=startX+(int)Math.Round(travel*step/64.0);
                    double requested=watch.Elapsed.TotalMilliseconds;
                    if(!SetWindowPos(host,IntPtr.Zero,x,frame.top,width,height,0x0010|0x0004)) { finish("owned_host_move_failed");return; }
                    requests.Add(new Dictionary<string,object>{{"atMs",requested},{"hostX",x},{"badgeX",x+offset}});
                    if(step==64)finalAt=requested;
                }
                Rect actual;GetWindowRect(badge,out actual);
                now=watch.Elapsed.TotalMilliseconds;
                samples.Add(new Dictionary<string,object>{{"atMs",now},{"badgeX",actual.left},{"foregroundHost",GetForegroundWindow()==host}});
                if(actual.left!=previousBadgeX) {
                    updates++;previousBadgeX=actual.left;
                    for(int index=requests.Count-1;index>=0;index--) {
                        if(Convert.ToInt32(requests[index]["badgeX"])==actual.left) { latencies.Add(now-Convert.ToDouble(requests[index]["atMs"]));break; }
                    }
                }
                if(step==64) {
                    if(actual.left==startX+travel+offset)finish("");
                    else if(now-finalAt>500)finish("final_position_did_not_settle");
                }
            } catch(Exception error) { finish("motion_probe_"+error.GetType().Name); }
        };
        timer.Start();
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
                    commandError="";
                    if(action=="move") SetWindowPos(host,IntPtr.Zero,Number(value,"x",120),Number(value,"y",100),Number(value,"width",1280),Number(value,"height",800),0x0010|0x0004);
                    else if(action=="captionless") {
                        SetWindowLongPtrW(host,-16,new IntPtr(GetWindowLongPtrW(host,-16).ToInt64()&~0x00c00000L));
                        SetWindowPos(host,IntPtr.Zero,0,0,0,0,0x0037);
                    }
                    else if(action=="measure-follow") MeasureFollow();
                    else if(action=="click-badge") commandError=ClickBadge(Number(value,"x",-1),Number(value,"y",-1),false);
                    else if(action=="toggle-badge") commandError=ClickBadge(Number(value,"x",-1),Number(value,"y",-1),true);
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
            Rect workArea=WorkArea(host);
            Dictionary<string,object> state=new Dictionary<string,object> {
                {"processId",System.Diagnostics.Process.GetCurrentProcess().Id},{"window",host.ToInt64()},
                {"otherWindow",other.ToInt64()},{"commandId",lastId},{"foreground",GetForegroundWindow()==host},
                {"commandError",commandError},{"physicalBadgeClicks",physicalBadgeClicks},{"pendingPhysicalClick",pendingPhysicalClick},
                {"pendingMotion",pendingMotion},
                {"minimized",IsIconic(host)},{"dpi",GetDpiForWindow(host)},
                {"style",GetWindowLongPtrW(host,-16).ToInt64()},{"extendedStyle",GetWindowLongPtrW(host,-20).ToInt64()},
                {"x",rect.left},{"y",rect.top},{"width",rect.right-rect.left},{"height",rect.bottom-rect.top},
                {"workArea",new Dictionary<string,object>{{"x",workArea.left},{"y",workArea.top},{"width",workArea.right-workArea.left},{"height",workArea.bottom-workArea.top}}}
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
