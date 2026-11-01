@echo off
setlocal enabledelayedexpansion
title SPACE WAR - LAUNCHER
color 0A

:: 1. Lay dia chi IP LAN
echo [1/3] Dang tim dia chi IP...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP=%%a"
    set "IP=!IP: =!"
    goto :got_ip
)
:got_ip

if "!IP!"=="" (
    echo [LOI] Khong the lay IP tu dong. Hay nhap IP cua ban:
    set /p IP="IP: "
)

:: 2. Kiem tra quyen Admin de mo Firewall
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [Admin] Dang kiem tra Firewall...
    netsh advfirewall firewall show rule name="Space War Server" >nul 2>&1
    if errorlevel 1 (
        echo [Admin] Dang mo cong 8080 va 8000...
        netsh advfirewall firewall add rule name="Space War Server" dir=in action=allow protocol=TCP localport=8080 >nul
        netsh advfirewall firewall add rule name="Space War Web" dir=in action=allow protocol=TCP localport=8000 >nul
    )
) else (
    echo [Canh bao] Khong co quyen Admin. Neu may 2 khong vao duoc, hay chuot phai chay file nay bang quyen Admin.
)

:: 3. Chay Game Server
echo.
echo [2/3] Dang khoi dong Game Server (Haskell)...
start "Game Server" cmd /k "cd /d %~dp0 && stack exec space-war-exe"

:: 4. Chay Web Server (Python)
echo [3/3] Dang khoi dong Web Server (Python)...
start "Web Server" cmd /k "cd /d %~dp0client && python -m http.server 8000"

:: 5. Doi 2 giay cho server san sang
timeout /t 2 /nobreak > nul

:: 6. Mo trinh duyet
echo Dang mo trinh duyet...
start http://!IP!:8000

echo.
echo ==================================================
echo DA KHOI DONG XONG!
echo - May nay (May 1): http://!IP!:8000
echo - May 2 (May khac): http://!IP!:8000
echo ==================================================
echo Moi thao tac tren cua so trinh duyet!
echo.
pause