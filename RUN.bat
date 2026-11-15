@echo off
rem Starts OrbitalUV on this computer. Keep this window open while you use it.
title OrbitalUV
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 app.py %*
) else (
    python app.py %*
)
if errorlevel 1 (
    echo.
    echo Could not start. You need Python 3.8 or newer: https://www.python.org/downloads/
    pause
)
