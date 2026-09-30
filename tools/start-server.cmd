@echo off
rem Travel Map - 一键启动本地服务并打开浏览器
setlocal
cd /d "%~dp0.."

set PORT=8080

echo.
echo  ==========================================
echo   Travel Map  -  http://localhost:%PORT%
echo  ==========================================
echo.

start "" http://localhost:%PORT%/

where python >nul 2>nul && (
  python -m http.server %PORT%
  goto :eof
)
where py >nul 2>nul && (
  py -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul && (
  npx -y serve -l %PORT% .
  goto :eof
)

echo [!] 未找到 python 或 npx，请安装其中之一后重试。
pause
