param(
    [Parameter(Mandatory = $true)]
    [string]$Executable
)

$argumentsJson = [Environment]::GetEnvironmentVariable("MDEDITOR_BATCH_ARGUMENTS", "Process")
$commandArguments = if ($argumentsJson) { @($argumentsJson | ConvertFrom-Json) } else { @() }
& $Executable @commandArguments
if ($null -eq $LASTEXITCODE) { exit 0 }
exit $LASTEXITCODE
