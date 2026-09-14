$ErrorActionPreference = 'Stop'
$repoRoot = "C:\dev\helix"
Set-Location $repoRoot

$env:HELIX_PORT = "8877"
$env:HELIX_HOST = "127.0.0.1"
$env:HELIX_WINDOWS_BRIDGE_URL = "http://127.0.0.1:8878"
$env:HELIX_WINDOWS_BRIDGE_COMMAND = "dotnet $repoRoot\native\windows-bridge\publish\WindowsBridge.dll"
$env:HELIX_TASK_DATABASE_PATH = "$repoRoot\helix.sqlite"
$env:HELIX_KB_SYNC_DB_PATH = "C:\dev\kb-sync\.kb_cache\knowledge.db"
$env:HELIX_WHICHLLM_ARTIFACT_PATH = "C:\dev\_integration\model_selection.json"
$env:HELIX_OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
$env:HELIX_CLAUDE_COMMAND = "C:\Users\soren\.local\bin\claude.exe"
$env:HELIX_CODEX_COMMAND = "C:\Users\soren\AppData\Roaming\npm\codex.cmd"

& npx tsx src/index.ts
