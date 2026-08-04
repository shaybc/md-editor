@echo off
setlocal

set "PARTS_DIR=%~dp0"
set "OUTPUT_FILE=%~dp0OpenJDK21U-jdk_x64_windows_hotspot_21.0.11_10.zip"
set "MANIFEST=%~dp0manifest.txt"

if not exist "%MANIFEST%" (
    echo ERROR: manifest.txt was not found in:
    echo "%PARTS_DIR%"
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$partsDir=$env:PARTS_DIR;" ^
  "$outputFile=$env:OUTPUT_FILE;" ^
  "$manifestFile=$env:MANIFEST;" ^
  "$manifest=@{};" ^
  "Get-Content -LiteralPath $manifestFile | ForEach-Object {" ^
  "  $key,$value=$_.Split('=',2);" ^
  "  $manifest[$key]=$value;" ^
  "};" ^
  "$parts=Get-ChildItem -LiteralPath $partsDir -Filter 'part-*.bin' | Sort-Object Name;" ^
  "if ($parts.Count -eq 0) { throw 'No part-*.bin files were found.' };" ^
  "if (Test-Path -LiteralPath $outputFile) {" ^
  "  Remove-Item -LiteralPath $outputFile -Force;" ^
  "};" ^
  "$target=[System.IO.File]::Create($outputFile);" ^
  "try {" ^
  "  foreach ($part in $parts) {" ^
  "    Write-Host ('Adding: ' + $part.Name);" ^
  "    $source=[System.IO.File]::OpenRead($part.FullName);" ^
  "    try {" ^
  "      $source.CopyTo($target);" ^
  "    } finally {" ^
  "      $source.Dispose();" ^
  "    };" ^
  "  };" ^
  "} finally {" ^
  "  $target.Dispose();" ^
  "};" ^
  "$actualHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $outputFile).Hash;" ^
  "if ($manifest.ContainsKey('SHA256') -and $actualHash -ne $manifest['SHA256']) {" ^
  "  Remove-Item -LiteralPath $outputFile -Force;" ^
  "  throw 'SHA256 verification failed. The restored ZIP was deleted.';" ^
  "};" ^
  "Write-Host '';" ^
  "Write-Host ('Successfully restored: ' + $outputFile);" ^
  "Write-Host ('SHA256: ' + $actualHash);"

if errorlevel 1 (
    echo.
    echo ERROR: Restoration failed.
    exit /b 1
)

echo.
echo Restoration completed successfully.
