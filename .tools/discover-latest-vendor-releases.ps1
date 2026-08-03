<#
.SYNOPSIS
Discovers the latest stable downloadable tools and JARs used by MD-Editor.

.DESCRIPTION
Reads the repository's current pins, queries official vendor release endpoints, and
emits a JSON report. With -DownloadAndValidate, candidate artifacts are downloaded
to an isolated temporary directory, hashed, and checked for required archive entries.
The script never edits manifests, source files, installed vendors, or download caches.
#>
[CmdletBinding()]
param(
    [switch]$DownloadAndValidate,
    [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:DesktopRoot = Join-Path $script:RepositoryRoot "desktop-app"
$script:RequestHeaders = @{
    "User-Agent" = "md-editor-vendor-release-discovery"
}

function Invoke-OfficialJsonRequest {
    param([Parameter(Mandatory)][string]$Uri)

    return Invoke-RestMethod -Uri $Uri -Headers $script:RequestHeaders
}

function Get-LatestStableGitHubRelease {
    param([Parameter(Mandatory)][string]$Repository)

    $githubHeaders = $script:RequestHeaders.Clone()
    $githubHeaders["Accept"] = "application/vnd.github+json"
    $releases = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$Repository/releases?per_page=20" `
        -Headers $githubHeaders
    $release = $releases | Where-Object { -not $_.draft -and -not $_.prerelease } | Select-Object -First 1
    if (-not $release) {
        throw "No stable GitHub release was found for $Repository."
    }
    return $release
}

function Get-RequiredReleaseAsset {
    param(
        [Parameter(Mandatory)]$Release,
        [Parameter(Mandatory)][string]$NamePattern,
        [Parameter(Mandatory)][string]$DisplayName
    )

    $asset = $Release.assets | Where-Object { $_.name -match $NamePattern } | Select-Object -First 1
    if (-not $asset) {
        throw "$DisplayName was not found in release $($Release.tag_name)."
    }
    return $asset
}

function Get-LatestJdtLsRelease {
    $indexUri = "https://download.eclipse.org/justj/?file=jdtls/milestones/"
    $content = (Invoke-WebRequest -Uri $indexUri -Headers $script:RequestHeaders).Content
    $versions = [regex]::Matches($content, '(?<![\d.])(\d+\.\d+\.\d+)(?![\d.])') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object { [version]$_ } -Descending -Unique
    $version = $versions | Select-Object -First 1
    if (-not $version) {
        throw "The Eclipse JDT LS milestone index did not contain a release version."
    }

    $releaseUri = "https://download.eclipse.org/jdtls/milestones/$version/"
    $releaseContent = (Invoke-WebRequest -Uri $releaseUri -Headers $script:RequestHeaders).Content
    $archiveName = [regex]::Match($releaseContent, 'jdt-language-server-[^"''<>\s]+\.tar\.gz').Value
    if (-not $archiveName) {
        throw "The Eclipse JDT LS $version page did not contain a release archive."
    }

    return [ordered]@{
        Version = $version
        Archive = $archiveName
        Url = "$releaseUri$archiveName"
    }
}

function Get-LatestMavenArtifact {
    param(
        [Parameter(Mandatory)][string]$RepositoryUri,
        [Parameter(Mandatory)][string]$ArtifactTemplate
    )

    $metadataUri = "$RepositoryUri/maven-metadata.xml"
    [xml]$metadata = (Invoke-WebRequest -Uri $metadataUri -Headers $script:RequestHeaders).Content
    $version = [string]$metadata.metadata.versioning.release
    if (-not $version) {
        $version = [string]$metadata.metadata.versioning.latest
    }
    if (-not $version) {
        throw "$metadataUri did not declare a latest release."
    }
    $archiveName = $ArtifactTemplate.Replace("{version}", $version)
    return [ordered]@{
        Version = $version
        Archive = $archiveName
        Url = "$RepositoryUri/$version/$archiveName"
    }
}

function Get-CurrentJdtLsVersion {
    $registryPath = Join-Path $script:DesktopRoot "resources\js\lsp\server-registry.js"
    $source = Get-Content -Raw $registryPath
    $match = [regex]::Match(
        $source,
        'id:\s*"eclipse-jdt-ls"[\s\S]*?supportedVersion:\s*"([^"]+)"'
    )
    if (-not $match.Success) {
        throw "The supported Eclipse JDT LS version was not found in $registryPath."
    }
    return $match.Groups[1].Value
}

function Get-ArchiveEntries {
    param([Parameter(Mandatory)][string]$ArchivePath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        return @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    } finally {
        $archive.Dispose()
    }
}

function Assert-ArchiveEntries {
    param(
        [Parameter(Mandatory)][string[]]$Entries,
        [Parameter(Mandatory)][string[]]$RequiredPatterns,
        [Parameter(Mandatory)][string]$DisplayName
    )

    foreach ($pattern in $RequiredPatterns) {
        if (-not ($Entries | Where-Object { $_ -like $pattern } | Select-Object -First 1)) {
            throw "$DisplayName is missing required archive entry: $pattern"
        }
    }
}

function Test-DownloadedCandidate {
    param(
        [Parameter(Mandatory)]$Candidate,
        [Parameter(Mandatory)][string]$DownloadRoot
    )

    if (-not $Candidate.Url -or -not $Candidate.Archive) {
        return
    }

    $destination = Join-Path $DownloadRoot $Candidate.Archive
    Invoke-WebRequest -Uri $Candidate.Url -Headers $script:RequestHeaders -OutFile $destination
    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
    if ($Candidate.ExpectedSha256 -and $actualSha256 -ne $Candidate.ExpectedSha256.ToLowerInvariant()) {
        throw "$($Candidate.Name) checksum mismatch: expected $($Candidate.ExpectedSha256), got $actualSha256."
    }

    if ($Candidate.Archive -match '\.tar\.gz$') {
        $entries = @(& tar -tzf $destination)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to inspect $($Candidate.Archive) with tar."
        }
    } else {
        $entries = Get-ArchiveEntries $destination
    }
    Assert-ArchiveEntries -Entries $entries -RequiredPatterns $Candidate.RequiredEntries -DisplayName $Candidate.Name
    $Candidate.ActualSha256 = $actualSha256
    $Candidate.Validation = "passed"
}

$kotlinManifest = Get-Content -Raw (Join-Path $script:DesktopRoot "kotlin-language-tools.json") |
    ConvertFrom-Json
$jdkManifest = Get-Content -Raw (Join-Path $script:DesktopRoot "tooling-jdk.json") |
    ConvertFrom-Json
$neutralinoConfig = Get-Content -Raw (Join-Path $script:DesktopRoot "neutralino.config.json") |
    ConvertFrom-Json

$kotlinCompilerRelease = Get-LatestStableGitHubRelease "JetBrains/kotlin"
$kotlinCompilerAsset = Get-RequiredReleaseAsset `
    -Release $kotlinCompilerRelease `
    -NamePattern '^kotlin-compiler-\d+(?:\.\d+)+(?:[-.][A-Za-z0-9]+)*\.zip$' `
    -DisplayName "Kotlin compiler archive"
$kotlinCompilerVersion = $kotlinCompilerAsset.name -replace '^kotlin-compiler-', '' -replace '\.zip$', ''

$kotlinLspRelease = Get-LatestStableGitHubRelease "Kotlin/kotlin-lsp"
$kotlinLspVersion = [regex]::Match([string]$kotlinLspRelease.tag_name, '(\d+(?:\.\d+)+)$').Groups[1].Value
if (-not $kotlinLspVersion) {
    throw "Unable to parse the Kotlin LSP version from $($kotlinLspRelease.tag_name)."
}
$kotlinLspArchive = "kotlin-server-$kotlinLspVersion.win.zip"
$kotlinLspUrl = "https://download-cdn.jetbrains.com/language-server/kotlin-server/$kotlinLspVersion/$kotlinLspArchive"

$adoptiumAssets = Invoke-OfficialJsonRequest `
    "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"
$jdkPackage = $adoptiumAssets[0].binary.package
if (-not $jdkPackage.link -or -not $jdkPackage.name) {
    throw "The Adoptium API did not return a Windows x64 JDK package."
}

$neutralinoRuntimeRelease = Get-LatestStableGitHubRelease "neutralinojs/neutralinojs"
$neutralinoClientRelease = Get-LatestStableGitHubRelease "neutralinojs/neutralino.js"
$currentJdtLsVersion = Get-CurrentJdtLsVersion
$jdtLsRelease = Get-LatestJdtLsRelease
$lemminxRelease = Get-LatestMavenArtifact `
    -RepositoryUri "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/org.eclipse.lemminx" `
    -ArtifactTemplate "org.eclipse.lemminx-{version}-uber.jar"
$lemminxMavenRelease = Get-LatestMavenArtifact `
    -RepositoryUri "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/lemminx-maven" `
    -ArtifactTemplate "lemminx-maven-{version}-zip-with-dependencies.zip"

$candidates = @(
    [pscustomobject][ordered]@{
        Name = "Kotlin LSP"
        CurrentVersion = [string]$kotlinManifest.kotlinLsp.version
        LatestVersion = $kotlinLspVersion
        Archive = $kotlinLspArchive
        Url = $kotlinLspUrl
        ExpectedSha256 = ""
        RequiredEntries = @("bin/intellij-server.exe")
        ActualSha256 = ""
        Validation = "not-run"
    },
    [pscustomobject][ordered]@{
        Name = "Kotlin compiler"
        CurrentVersion = [string]$kotlinManifest.kotlinCompiler.version
        LatestVersion = $kotlinCompilerVersion
        Archive = [string]$kotlinCompilerAsset.name
        Url = [string]$kotlinCompilerAsset.browser_download_url
        ExpectedSha256 = [string]$kotlinCompilerAsset.digest -replace '^sha256:', ''
        RequiredEntries = @("kotlinc/bin/kotlinc.bat", "kotlinc/lib/jvm-abi-gen.jar")
        ActualSha256 = ""
        Validation = "not-run"
    },
    [pscustomobject][ordered]@{
        Name = "Temurin tooling JDK 21"
        CurrentVersion = [string]$jdkManifest.version
        LatestVersion = ([string]$adoptiumAssets[0].version.openjdk_version -replace '-LTS$', '')
        Archive = [string]$jdkPackage.name
        Url = [string]$jdkPackage.link
        ExpectedSha256 = [string]$jdkPackage.checksum
        RequiredEntries = @("*/bin/java.exe", "*/bin/javac.exe", "*/bin/jar.exe")
        ActualSha256 = ""
        Validation = "not-run"
    },
    [pscustomobject][ordered]@{
        Name = "Eclipse JDT LS"
        CurrentVersion = $currentJdtLsVersion
        LatestVersion = [string]$jdtLsRelease.Version
        Archive = [string]$jdtLsRelease.Archive
        Url = [string]$jdtLsRelease.Url
        ExpectedSha256 = ""
        RequiredEntries = @("config_win/*", "features/*", "plugins/org.eclipse.jdt.ls.core_*.jar")
        ActualSha256 = ""
        Validation = "not-run"
    },
    [pscustomobject][ordered]@{
        Name = "Eclipse LemMinX"
        CurrentVersion = "dynamic-latest"
        LatestVersion = [string]$lemminxRelease.Version
        Archive = [string]$lemminxRelease.Archive
        Url = [string]$lemminxRelease.Url
        ExpectedSha256 = ""
        RequiredEntries = @("org/eclipse/lemminx/XMLServerLauncher.class")
        ActualSha256 = ""
        Validation = "not-run"
    },
    [pscustomobject][ordered]@{
        Name = "LemMinX Maven extension"
        CurrentVersion = "dynamic-latest"
        LatestVersion = [string]$lemminxMavenRelease.Version
        Archive = [string]$lemminxMavenRelease.Archive
        Url = [string]$lemminxMavenRelease.Url
        ExpectedSha256 = ""
        RequiredEntries = @("*.jar")
        ActualSha256 = ""
        Validation = "not-run"
    }
)

if ($DownloadAndValidate) {
    $validationRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("md-editor-vendor-validation-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $validationRoot | Out-Null
    try {
        foreach ($candidate in $candidates) {
            Test-DownloadedCandidate -Candidate $candidate -DownloadRoot $validationRoot
        }
    } finally {
        Remove-Item -LiteralPath $validationRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$report = [ordered]@{
    GeneratedAtUtc = [DateTime]::UtcNow.ToString("o")
    RepositoryRoot = $script:RepositoryRoot
    DiscoveryOnly = -not $DownloadAndValidate
    Releases = $candidates
    MetadataOnly = @(
        [ordered]@{
            Name = "Neutralino runtime"
            CurrentVersion = [string]$neutralinoConfig.cli.binaryVersion
            LatestVersion = ([string]$neutralinoRuntimeRelease.tag_name -replace '^v', '')
            ReleaseUrl = [string]$neutralinoRuntimeRelease.html_url
        },
        [ordered]@{
            Name = "Neutralino client"
            CurrentVersion = [string]$neutralinoConfig.cli.clientVersion
            LatestVersion = ([string]$neutralinoClientRelease.tag_name -replace '^v', '')
            ReleaseUrl = [string]$neutralinoClientRelease.html_url
        }
    )
}

$json = $report | ConvertTo-Json -Depth 8
if ($ReportPath) {
    $resolvedReportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
    $reportDirectory = Split-Path -Parent $resolvedReportPath
    if ($reportDirectory) {
        New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    }
    Set-Content -LiteralPath $resolvedReportPath -Value $json -Encoding UTF8
    Write-Host "[success] Vendor release report written to $resolvedReportPath"
} else {
    $json
}
