@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===============================================
echo   ECO: Sky Booster - local server
echo   PC:     http://localhost:8080
echo   Mobile: http://[this PC's IP]:8080  (same Wi-Fi)
echo   Stop: Ctrl+C
echo ===============================================
start "" http://localhost:8080
python -m http.server 8080 --bind 0.0.0.0
