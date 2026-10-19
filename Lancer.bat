@echo off
cd /d "%~dp0"
echo ==========================================
echo   LABYRINTHE - lancement local
echo ==========================================
echo.
echo  Si le navigateur affiche une page blanche,
echo  ouvre directement index.html a la place.
echo.
start "" http://127.0.0.1:8123/
python -m http.server 8123 --bind 127.0.0.1
