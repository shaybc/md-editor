@echo off
setlocal

set "PARTS_DIR=%~dp0kotlin-server-parts"
set "OUTPUT_FILE=%~dp0kotlin-server-262.8190.0.win.zip"
set "MANIFEST=%PARTS_DIR%\manifest.txt"

if not exist "%PARTS_DIR%\" (
    echo ERROR: Parts folder not found:
    echo "%PARTS_DIR%"
    exit /b 1
)

if not exist "%MANIFEST%" (
    echo ERROR: Manifest not found:
    echo "%MANIFEST%"
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$partsDir=$env:PARTS_DIR;" ^
  "$outputFile=$env:OUTPUT_FILE;" ^
  "$manifestFile=$env:MANIFEST;" ^
  "$manifest=@{};" ^
  "Get-Content -LiteralPath $manifestFile | ForEach-Object {" ^
  "  if ($_ -match '^\s*([^=]+?)\s*=\s*(.*?)\s*$') {" ^
  "    $manifest[$Matches[1].Trim()]=$Matches[2].Trim();" ^
  "  };" ^
  "};" ^
  "if (-not $manifest.ContainsKey('SHA256') -or [string]::IsNullOrWhiteSpace($manifest['SHA256'])) {" ^
  "  throw 'SHA256 is missing from manifest.txt.';" ^
  "};" ^
  "$parts=@(Get-ChildItem -LiteralPath $partsDir -File -Filter 'part-*.bin' | Sort-Object Name);" ^
  "if ($parts.Count -eq 0) {" ^
  "  throw 'No part-*.bin files were found.';" ^
  "};" ^
  "if ($manifest.ContainsKey('PartCount') -and -not [string]::IsNullOrWhiteSpace($manifest['PartCount'])) {" ^
  "  $expectedCount=[int]$manifest['PartCount'];" ^
  "  if ($parts.Count -ne $expectedCount) {" ^
  "    throw ('Expected ' + $expectedCount + ' parts, but found ' + $parts.Count + '.');" ^
  "  };" ^
  "};" ^
  "Write-Host ('Found ' + $parts.Count + ' parts.');" ^
  "if (Test-Path -LiteralPath $outputFile) {" ^
  "  Remove-Item -LiteralPath $outputFile -Force;" ^
  "};" ^
  "$output=[System.IO.File]::Create($outputFile);" ^
  "try {" ^
  "  foreach ($part in $parts) {" ^
  "    Write-Host ('Adding: ' + $part.Name);" ^
  "    $input=[System.IO.File]::OpenRead($part.FullName);" ^
  "    try {" ^
  "      $input.CopyTo($output);" ^
  "    } finally {" ^
  "      $input.Dispose();" ^
  "    };" ^
  "  };" ^
  "} finally {" ^
  "  $output.Dispose();" ^
  "};" ^
  "$expectedHash=$manifest['SHA256'].Trim().ToUpperInvariant();" ^
  "$actualHash=(Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.Trim().ToUpperInvariant();" ^
  "Write-Host '';" ^
  "Write-Host ('Expected: ' + $expectedHash);" ^
  "Write-Host ('Actual:   ' + $actualHash);" ^
  "if ($actualHash -ne $expectedHash) {" ^
  "  throw 'SHA256 verification failed.';" ^
  "};" ^
  "Write-Host '';" ^
  "Write-Host ('Successfully restored: ' + $outputFile);"

if errorlevel 1 (
    echo.
    echo ERROR: Restoration failed.
    exit /b 1
)

echo.
echo Restoration completed successfully.