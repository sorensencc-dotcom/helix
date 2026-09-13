$ErrorActionPreference = 'Stop'
$repoRoot = "C:\dev\helix"
Set-Location $repoRoot

$env:HELIX_PORT = "8877"
$env:HELIX_HOST = "127.0.0.1"
$env:HELIX_WINDOWS_BRIDGE_URL = "http://127.0.0.1:8878"
$env:HELIX_WINDOWS_BRIDGE_COMMAND = "dotnet $repoRoot\native\windows-bridge\publish\WindowsBridge.dll"
$env:HELIX_TASK_DATABASE_PATH = "$repoRoot\helix.sqlite"
$env:HELIX_CLAUDE_COMMAND = "C:\Users\soren\.local\bin\claude.exe"
$env:HELIX_CODEX_COMMAND = "C:\Users\soren\AppData\Roaming\npm\codex.cmd"

& npx tsx src/index.ts
