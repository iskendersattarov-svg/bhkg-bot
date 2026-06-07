Set-Location $PSScriptRoot

git init
git config user.email "iskendersattarov@gmail.com"
git config user.name "Iskender"

"node_modules/`n.env`n.vercel`n*.local" | Out-File -Encoding utf8 .gitignore

git add -A
git commit -m "initial commit"

git remote add origin https://github.com/iskendersattarov-svg/bhkg-bot.git
git branch -M main
git push -u origin main

Write-Host ""
Write-Host "DONE! Now go to Vercel and connect GitHub repo." -ForegroundColor Green
Write-Host "https://vercel.com/dashboard" -ForegroundColor Cyan
Write-Host ""
pause
