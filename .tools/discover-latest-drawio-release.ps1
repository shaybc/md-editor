param(
    [switch]$UpdateAndPackage,
    [string]$ReportPath = ".\drawio-release-report.json"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$desktopRoot = Join-Path $repositoryRoot "desktop-app"
$manifestPath = Join-Path $desktopRoot "drawio-vendor.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$headers = @{ "User-Agent" = "MD-Editor draw.io vendor discovery"; "Accept" = "application/vnd.github+json" }
$releaseApi = "https://api.github.com/repos/jgraph/drawio/releases/latest"

function Test-StableTag([string]$Tag) {
    return $Tag -match '^v\d+\.\d+\.\d+$' -and $Tag -notmatch '(?i)(alpha|beta|rc|snapshot|nightly)'
}

function Test-SafeArchiveEntries([string[]]$Entries) {
    foreach ($entry in $Entries) {
        $normalized = $entry.Replace('\', '/')
        if ($normalized.StartsWith('/') -or $normalized -match '(^|/)\.\.(/|$)') {
            throw "Unsafe archive entry: $entry"
        }
    }
}

$release = Invoke-RestMethod -Uri $releaseApi -Headers $headers
if ($release.draft -or $release.prerelease -or -not (Test-StableTag $release.tag_name)) {
    throw "Latest official draw.io release is not an eligible stable release: $($release.tag_name)"
}

$tag = [string]$release.tag_name
$version = $tag.TrimStart('v')
$tagRefApi = "https://api.github.com/repos/jgraph/drawio/git/ref/tags/$tag"
$tagRef = Invoke-RestMethod -Uri $tagRefApi -Headers $headers
$commit = [string]$tagRef.object.sha
if ($tagRef.object.type -eq "tag") {
    $tagObject = Invoke-RestMethod -Uri $tagRef.object.url -Headers $headers
    $commit = [string]$tagObject.object.sha
}
if ($commit -notmatch '^[a-f0-9]{40}$') { throw "Unable to resolve the release commit for $tag" }

$archiveName = "drawio-$commit.tar.gz"
$archiveUrl = "https://github.com/jgraph/drawio/archive/$commit.tar.gz"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("md-editor-drawio-discovery-" + [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $tempRoot $archiveName
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
    Invoke-WebRequest -Uri $archiveUrl -Headers $headers -OutFile $archivePath
    $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    $archiveRoot = "drawio-$commit"
    $entries = @(& tar -tzf $archivePath)
    if ($LASTEXITCODE -ne 0) { throw "Unable to list the candidate archive" }
    Test-SafeArchiveEntries $entries

    $required = @($manifest.requiredEntries)
    $missing = @()
    foreach ($requiredEntry in $required) {
        $expected = "$archiveRoot/$requiredEntry"
        if (-not ($entries | Where-Object { $_ -eq $expected -or $_.StartsWith("$expected/") } | Select-Object -First 1)) {
            $missing += $requiredEntry
        }
    }
    if ($missing.Count -gt 0) { throw "Candidate archive is missing: $($missing -join ', ')" }

    $report = [ordered]@{
        generatedAtUtc = [DateTime]::UtcNow.ToString('o')
        source = "https://github.com/jgraph/drawio"
        current = [ordered]@{ version = $manifest.version; tag = $manifest.tag; commit = $manifest.commit; sha256 = $manifest.sha256 }
        candidate = [ordered]@{ version = $version; tag = $tag; commit = $commit; archive = $archiveName; url = $archiveUrl; sha256 = $sha256 }
        validation = [ordered]@{ stable = $true; archivePathsSafe = $true; requiredEntriesPresent = $true; passed = $true }
        updateAvailable = $commit -ne [string]$manifest.commit
    }
    $resolvedReportPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $ReportPath))
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedReportPath -Encoding UTF8
    Write-Host "Validated draw.io $version ($commit). SHA-256: $sha256"
    Write-Host "Report: $resolvedReportPath"

    if ($UpdateAndPackage) {
        $manifest.version = $version
        $manifest.tag = $tag
        $manifest.commit = $commit
        $manifest.archive = $archiveName
        $manifest.url = $archiveUrl
        $manifest.sha256 = $sha256
        $manifest.archiveRoot = $archiveRoot
        $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
        $env:MDEDITOR_DRAWIO_ARCHIVE = $archivePath
        try {
            & node (Join-Path $desktopRoot "download-drawio-vendor.js") --force
            if ($LASTEXITCODE -ne 0) { throw "draw.io materialization failed" }
        } finally {
            Remove-Item Env:MDEDITOR_DRAWIO_ARCHIVE -ErrorAction SilentlyContinue
        }
        Write-Host "Pinned and materialized draw.io $version for the next MD-Editor release."
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
