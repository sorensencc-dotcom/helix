# Installs Helix daemon to autostart on user logon and restart after failure.
$scriptPath = "C:\dev\helix\scripts\start-helix-daemon.ps1"
$pwshPath = (Get-Command pwsh.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $pwshPath -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "HelixDaemon" -Action $action -Trigger $trigger -Settings $settings -Description "Helix local daemon" -Force | Out-Null
Write-Host "Helix daemon scheduled task configured: HelixDaemon."
