Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
'@
$results = New-Object System.Collections.ArrayList
$cb = [W+EnumWindowsProc]{
  param($h, $p)
  $sb = New-Object System.Text.StringBuilder 256
  [void][W]::GetWindowText($h, $sb, 256)
  $t = $sb.ToString()
  if ($t -and ($t -match 'OpenBuddy|openbuddy')) {
    $vis = [W]::IsWindowVisible($h)
    $r = New-Object W+RECT
    [void][W]::GetWindowRect([ref]$r)
    $w = $r.R - $r.L; $ht = $r.B - $r.T
    [void]$results.Add(("{0,-14} vis={1} size={2}x{3} at=({4},{5}) title={6}" -f $h, $vis, $w, $ht, $r.L, $r.T, $t))
  }
  return $true
}
[void][W]::EnumWindows($cb, [IntPtr]::Zero)
$results -join "`n"
