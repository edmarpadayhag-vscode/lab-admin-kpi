@echo off
setlocal enabledelayedexpansion
title Lab Admin KPI

REM ====== Settings ======================================================
set "PROJECT_DIR=%~dp0"
set "URL=http://localhost:4000"
set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"
REM ======================================================================

echo ==========================================================
echo    Lab Admin KPI
echo ==========================================================
echo.

REM --- 1. Make sure the Docker engine is running -----------------------
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo Docker is not running. Starting Docker Desktop...
if exist "%DOCKER_EXE%" (
    start "" "%DOCKER_EXE%"
) else (
    echo   WARNING: Docker Desktop not found at:
    echo   %DOCKER_EXE%
    echo   Please start Docker manually.
)

echo Waiting for the Docker engine to come online (this can take a minute)...
:wait_docker
ping -n 4 127.0.0.1 >nul
docker info >nul 2>&1
if errorlevel 1 goto wait_docker

:docker_ready
echo Docker engine is ready.
echo.

REM --- 2. Start the application stack ----------------------------------
echo Starting the application (first run builds the image, please wait)...
pushd "%PROJECT_DIR%"
docker compose up -d
if errorlevel 1 (
    echo.
    echo *** Failed to start the containers. See the messages above. ***
    popd
    pause
    exit /b 1
)
popd
echo.

REM --- 3. Wait for the web app to respond ------------------------------
echo Waiting for the app to be ready...
set /a tries=0
:wait_app
set /a tries+=1
ping -n 3 127.0.0.1 >nul
for /f %%c in ('curl -s -o nul -w "%%{http_code}" "%URL%/" 2^>nul') do set "code=%%c"
if "!code!"=="200" goto app_ready
if !tries! geq 60 (
    echo The app did not respond after 2 minutes. Opening the browser anyway...
    goto app_ready
)
goto wait_app

:app_ready
echo App is ready.
echo Opening %URL% ...
start "" "%URL%"

endlocal
