@echo off
echo Deploying to Vercel...
cd /d "%~dp0"
where vercel >nul 2>&1
if %errorlevel% neq 0 (
  echo Installing Vercel CLI...
  npm install -g vercel
)
vercel deploy --prod
pause
