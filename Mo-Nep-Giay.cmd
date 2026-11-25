@echo off
setlocal
cd /d "%~dp0"
set "NG_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NG_ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NG_ARCH=arm64"
set "NG_CACHE=%LOCALAPPDATA%\NepGiay"
set "NG_RUNTIME=%NG_CACHE%\node24-%NG_ARCH%"
if exist "%NG_RUNTIME%\node.exe" goto dependencies
echo Dang chuan bi Node.js cho lan mo dau tien...
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $tmp=Join-Path $env:TEMP ([guid]::NewGuid().ToString()); New-Item -ItemType Directory $tmp | Out-Null; try { $index=Join-Path $tmp 'hashes.txt'; Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -OutFile $index; $pattern='(?m)^([a-fA-F0-9]{64})\s+(node-(v[0-9.]+)-win-'+$env:NG_ARCH+'\.zip)\s*$'; $m=[regex]::Match([IO.File]::ReadAllText($index),$pattern); if(!$m.Success){throw 'Khong tim thay Node.js'}; $name=$m.Groups[2].Value; $zip=Join-Path $tmp $name; Invoke-WebRequest -UseBasicParsing ('https://nodejs.org/dist/'+$m.Groups[3].Value+'/'+$name) -OutFile $zip; if((Get-FileHash $zip).Hash -ne $m.Groups[1].Value){throw 'Checksum khong khop'}; Expand-Archive -LiteralPath $zip -DestinationPath $tmp; New-Item -ItemType Directory -Force $env:NG_CACHE | Out-Null; Move-Item (Join-Path $tmp ([IO.Path]::GetFileNameWithoutExtension($name))) $env:NG_RUNTIME } finally { Remove-Item -LiteralPath $tmp -Recurse -Force }"
if errorlevel 1 goto failed
:dependencies
set "PATH=%NG_RUNTIME%;%PATH%"
set "NG_DEPS=%NG_CACHE%\deps-1.58.2"
set "NODE_PATH=%NG_DEPS%\node_modules"
if exist "%NG_DEPS%\ready.txt" goto launch
echo Dang chuan bi cong cu chuyen PDF...
call "%NG_RUNTIME%\npm.cmd" install --prefix "%NG_DEPS%" --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund playwright@1.58.2
if errorlevel 1 goto failed
echo ready>"%NG_DEPS%\ready.txt"
:launch
set "NEP_GIAY_DESKTOP=1"
"%NG_RUNTIME%\node.exe" "%~dp0converter.mjs"
if errorlevel 1 goto failed
exit /b 0
:failed
echo Khong the khoi dong. Xem thong bao ben tren va thu lai.
pause
exit /b 1
