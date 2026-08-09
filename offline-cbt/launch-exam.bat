@echo off
REM ============================================================
REM launch-exam.bat - Offline CBT kiosk launcher
REM Dr. Jaspal Singh - jaspalsingh.in
REM
REM Double-click this file to open the exam app fullscreen, with
REM no address bar, no tabs, and no way for a learner to switch
REM windows or browse elsewhere. Staff can still exit with Alt+F4
REM (a Windows shortcut, not a browser one - kiosk mode can't
REM block it) to reset the machine for the next learner or to
REM connect to the hotspot for syncing.
REM
REM Tries Chrome first, falls back to Edge (built into Windows,
REM so this should always find something) if Chrome isn't
REM installed on this machine.
REM ============================================================

set "EXAM_URL=%~dp0index.html"

set "CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "KIOSK_FLAGS=--kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-pinch --no-first-run --new-window"

if exist "%CHROME1%" (
  start "" "%CHROME1%" %KIOSK_FLAGS% "%EXAM_URL%"
  goto :end
)
if exist "%CHROME2%" (
  start "" "%CHROME2%" %KIOSK_FLAGS% "%EXAM_URL%"
  goto :end
)
if exist "%EDGE1%" (
  start "" "%EDGE1%" %KIOSK_FLAGS% "%EXAM_URL%"
  goto :end
)
if exist "%EDGE2%" (
  start "" "%EDGE2%" %KIOSK_FLAGS% "%EXAM_URL%"
  goto :end
)

echo Could not find Chrome or Edge on this computer.
echo Opening the exam in your default browser instead - it will
echo NOT be locked down (learner can switch tabs/windows).
start "" "%EXAM_URL%"

:end
