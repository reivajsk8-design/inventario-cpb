@echo off
title PrecioScan Server
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  PrecioScan Server - CPB                 ║
echo  ║  Iniciando en http://localhost:3001       ║
echo  ╚══════════════════════════════════════════╝
echo.
node "%~dp0precio-scan-server.js"
pause
