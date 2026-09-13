# Removes Helix daemon autostart from HKCU Run key
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "HelixDaemon" -ErrorAction SilentlyContinue
Write-Host "Helix daemon autostart removed from HKCU Run key."
