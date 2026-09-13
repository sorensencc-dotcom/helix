# Installs Helix daemon to autostart on user logon via HKCU Run key
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "HelixDaemon" -Value "pwsh.exe -NoProfile -WindowStyle Hidden -File C:\dev\helix\scripts\start-helix-daemon.ps1"
Write-Host "Helix daemon autostart configured in HKCU Run key."
