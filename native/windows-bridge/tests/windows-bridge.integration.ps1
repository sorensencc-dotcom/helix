$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { Write-Output 'SKIP: Windows required'; exit 0 }
$project = Join-Path $PSScriptRoot '..\WindowsBridge.csproj'
$job = Start-Process dotnet -ArgumentList @('run','--project',$project,'--no-launch-profile') -PassThru -WindowStyle Hidden
try {
  $response = $null
  1..20 | ForEach-Object {
    try {
      $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8792/v1/principal' -Method Get -UseDefaultCredentials -AllowUnencryptedAuthentication
      return
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if ($null -eq $response) { throw 'bridge did not become ready' }
  if ($response.contract -ne 'helix.windows-principal.v1') { throw 'wrong contract' }
  if ([string]::IsNullOrWhiteSpace($response.identity.sid) -or [string]::IsNullOrWhiteSpace($response.identity.upn)) { throw 'incomplete identity' }
  if ($response.identity.groups.Count -gt 256) { throw 'too many groups' }
  Write-Output 'PASS: Negotiate SSPI and principal mapping'
} finally { Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue }