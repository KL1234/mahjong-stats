@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo  麻將統計 - 本機開發伺服器
echo  網址: http://localhost:8000/
echo  停止: 按 Ctrl+C 或關閉此視窗
echo ========================================
start "" "http://localhost:8000/"
python -m http.server 8000
