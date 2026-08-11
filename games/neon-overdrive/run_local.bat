@echo off
cd /d "%~dp0"
echo NEON OVERDRIVE is running at http://localhost:8080
echo Press Ctrl+C to stop.
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8080
) else (
  python -m http.server 8080
)
