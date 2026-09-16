$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-ProjectCheck([string] $Folder, [string] $Script) {
    Push-Location (Join-Path $projectRoot $Folder)
    try {
        & npm.cmd run $Script
        if ($LASTEXITCODE -ne 0) { throw "$Folder : $Script failed ($LASTEXITCODE)" }
    } finally { Pop-Location }
}

Invoke-ProjectCheck 'server' 'typecheck'
Invoke-ProjectCheck 'server' 'lint'
Invoke-ProjectCheck 'server' 'test'
Invoke-ProjectCheck 'server' 'build'
Invoke-ProjectCheck 'server' 'db:validate'
Invoke-ProjectCheck 'ai-create/client' 'typecheck'
Invoke-ProjectCheck 'ai-create/client' 'lint'
Invoke-ProjectCheck 'ai-create/client' 'build'
Write-Output 'All offline checks passed. Run test:db separately with TEST_DATABASE_URL.'
