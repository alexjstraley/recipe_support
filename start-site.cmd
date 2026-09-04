@echo off
cd /d "%~dp0"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo Could not find Node.js.
    echo.
    echo Open index.html directly, or install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node.exe"
)

echo Starting Recipe Support...
echo.
echo Keep this window open while you test the site.
echo.
"%NODE_EXE%" local-server.js
echo.
echo The local server stopped.
pause
