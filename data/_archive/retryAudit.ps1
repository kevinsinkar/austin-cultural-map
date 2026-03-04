$env:RETRY_FAILED = "true"
Set-Location $PSScriptRoot
node auditRunner.js *> retry_full.log
Write-Host "DONE - Exit code: $LASTEXITCODE"
Write-Host "Output:"
Get-Content retry_full.log
