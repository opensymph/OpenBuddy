param([string]$TitleMatch = "OpenBuddy")
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W2 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
}
'@
$found = $null
$cb = [W2+EnumWindowsProc]{
  param($h, $p)
  $sb = New-Object System.Text.StringBuilder 256
  [void][W2]::GetWindowText($h, $sb, 256)
  $t = $sb.ToString()
  if ($t -and $t -eq $TitleMatch -and [W2]::IsWindowVisible($h)) {
    $script:found = $h
  }
  return $true
}
[void][W2]::EnumWindows($cb, [IntPtr]::Zero)
if (-not $script:found) { Write-Output "NOT_FOUND"; exit 1 }
$h = $script:found
$r = New-Object W2+RECT
[void][W2]::GetClientRect($h, [ref]$r)
$pt = New-Object W2+POINT
[void][W2]::ClientToScreen($h, [ref]$pt)
"W={0} H={1} X={2} Y={3}" -f ($r.R - $r.L), ($r.B - $r.T), $pt.X, $pt.Y
