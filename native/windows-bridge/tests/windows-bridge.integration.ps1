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

  $sessionId = 'session_integration_fixture'
  $plaintext = 'helix-dpapi-roundtrip'
  $plaintextB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plaintext))
  $encryptBody = @{ contract = 'helix.dpapi-crypto.v1'; sessionId = $sessionId; plaintext = $plaintextB64 } | ConvertTo-Json
  $encrypted = Invoke-RestMethod -Uri 'http://127.0.0.1:8792/v1/crypto/encrypt' -Method Post -Body $encryptBody -ContentType 'application/json' -UseDefaultCredentials -AllowUnencryptedAuthentication
  if ($encrypted.contract -ne 'helix.dpapi-crypto.v1') { throw 'wrong crypto contract' }
  if ($encrypted.ciphertext -eq $plaintextB64) { throw 'ciphertext not protected' }

  $decryptBody = @{ contract = 'helix.dpapi-crypto.v1'; sessionId = $sessionId; ciphertext = $encrypted.ciphertext } | ConvertTo-Json
  $decrypted = Invoke-RestMethod -Uri 'http://127.0.0.1:8792/v1/crypto/decrypt' -Method Post -Body $decryptBody -ContentType 'application/json' -UseDefaultCredentials -AllowUnencryptedAuthentication
  $decryptedText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($decrypted.plaintext))
  if ($decryptedText -ne $plaintext) { throw 'decrypt did not round-trip' }

  $deleteBody = @{ contract = 'helix.dpapi-crypto.v1'; sessionId = $sessionId } | ConvertTo-Json
  $deleted = Invoke-RestMethod -Uri 'http://127.0.0.1:8792/v1/crypto/delete' -Method Delete -Body $deleteBody -ContentType 'application/json' -UseDefaultCredentials -AllowUnencryptedAuthentication
  if ($deleted.deleted -ne $true) { throw 'delete did not acknowledge' }
  Write-Output 'PASS: DPAPI crypto round trip and delete acknowledgement'
} finally { Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue }