@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Нужен Node.js 22.22 или новее. Установите его с https://nodejs.org/ и повторите запуск.
  pause
  exit /b 1
)
node scripts/demo.mjs
if errorlevel 1 pause
