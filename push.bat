@echo off
cd /d "%~dp0"
git add -A
git commit -m "update"
git push
echo.
echo Deployed! Vercel will update in ~30 seconds.
pause
