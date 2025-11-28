@echo off
echo ==========================================
echo      STARTING ONE-CLICK BACKUP
echo ==========================================
echo.

:: Navigate to project directory
cd /d "c:\Users\Public\PROJECECT QUOTE\pq\pq"

:: Add all changes
echo [1/3] Staging files...
git add .

:: Commit changes with timestamp
echo [2/3] Saving snapshot...
git commit -m "Auto-backup: %date% %time%"

:: Push to GitHub
echo [3/3] Uploading to GitHub...
git push origin main

echo.
echo ==========================================
echo      BACKUP COMPLETE!
echo ==========================================
echo.
pause
