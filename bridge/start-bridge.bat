@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Якщо сайт стоїть на GitHub Pages, впишіть сюди його адресу (без / в кінці), напр. https://ivan.github.io
set SITE=https://ВАШ-ЛОГІН.github.io

where node >nul 2>nul || (echo Node.js не знайдено. Встановіть його з https://nodejs.org та запустіть файл знову. & pause & exit /b 1)
if not exist node_modules (
  echo Перший запуск: встановлюю залежності...
  call npm install --no-audit --no-fund
)
node server.js --allow %SITE% %*
pause
