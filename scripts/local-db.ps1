param(
    [ValidateSet('start', 'stop', 'status')][string] $Action = 'status',
    [string] $PgBin = 'C:\Program Files\PostgreSQL\18\bin'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.local/pg-foundation'))
$localDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.local'))
if (-not $dataDirectory.StartsWith($localDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Database directory must stay inside this project .local directory.'
}
if (-not (Test-Path (Join-Path $dataDirectory 'PG_VERSION'))) {
    throw 'The project-local cluster does not exist. Configure PostgreSQL as described in README.'
}
$pgCtl = Join-Path $PgBin 'pg_ctl.exe'
if (-not (Test-Path $pgCtl)) { throw "PostgreSQL utility not found: $pgCtl" }
if ($Action -eq 'status') { & $pgCtl -D $dataDirectory status; exit $LASTEXITCODE }
if ($Action -eq 'start') {
    & $pgCtl -D $dataDirectory status *> $null
    if ($LASTEXITCODE -eq 0) { Write-Output 'Project database is already running.'; exit 0 }
}
$arguments = @('-D', ('"{0}"' -f $dataDirectory), '-w')
if ($Action -eq 'start') {
    $arguments += @('-l', ('"{0}"' -f (Join-Path $localDirectory 'pg-foundation.log')), '-o', '"-h 127.0.0.1 -p 55432"', 'start')
} else { $arguments += @('-m', 'fast', 'stop') }
$process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(30000)) { throw 'PostgreSQL command timed out; inspect .local/pg-foundation.log.' }
if ($process.ExitCode -ne 0) { throw 'PostgreSQL command failed; inspect .local/pg-foundation.log.' }
Write-Output "Project database: $Action completed."
