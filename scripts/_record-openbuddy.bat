@echo off
REM Records the primary desktop for N seconds, then crops to the OpenBuddy
REM window region and produces a size-optimized GIF for the README.
REM
REM Usage: _record-openbuddy.bat <duration_sec>
REM
REM OpenBuddy window region (auto-fetched via _get-rect.ps1):
REM   W=1200 H=931 X=1236 Y=152  (edit below if window moved)

setlocal
set DUR=%~1
if "%DUR%"=="" set DUR=12

set FF=C:\Users\chenr\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe
set OUT=E:\Grok\openbuddy\docs\screenshots
set RAW=%OUT%\_raw-openbuddy.mp4
set GIF=%OUT%\hero-openbuddy.gif

REM Region (update if OpenBuddy window is moved/resized)
set /a RX=551
set /a RY=268
set /a RW=1644
set /a RH=932

echo [1/2] Recording %DUR%s of desktop to %RAW% ...
"%FF%" -y -f gdigrab -framerate 30 -i desktop -t %DUR% -vcodec libx264 -preset ultrafast -crf 28 "%RAW%"

echo [2/2] Cropping to OpenBuddy region and converting to GIF ...
"%FF%" -y -i "%RAW%" -vf "crop=%RW%:%RH%:%RX%:%RY%,fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 "%GIF%"

echo.
echo DONE
echo   raw mp4 : %RAW%
echo   gif     : %GIF%
endlocal
