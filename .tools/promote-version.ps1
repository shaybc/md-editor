<#
.SYNOPSIS
Promotes MD-Editor to the next release version.

.DESCRIPTION
Updates the current desktop release surfaces, runs validation, commits, tags, and
pushes the release. The script requires a clean worktree before editing so local
feature work cannot be mixed into a release commit by accident.
#>
[CmdletBinding()]
param(
    [ValidateSet("minor", "major")]
    [string]$Bump = "minor",

    [string]$Version,

    [string[]]$ReleaseNotes,

    [datetime]$ReleaseDate = (Get-Date),

    [switch]$NoPush,

    [switch]$SkipValidation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopRoot = Join-Path $RepositoryRoot "desktop-app"
$ReleaseFiles = @(
    "README.md",
    "desktop-app/package.json",
    "desktop-app/package-lock.json",
    "desktop-app/neutralino.config.json",
    "desktop-app/resources/index.html",
    "desktop-app/resources/js/main.js",
    "desktop-app/resources/assets/badges/release.svg",
    "desktop-app/help/user/release-notes.md"
)

function ConvertTo-ProcessArgument {
    param([Parameter(Mandatory)][string]$Value)

    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-RepositoryGitResult {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "git"
    $startInfo.Arguments = ((@("-C", $RepositoryRoot) + $Arguments) | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join " "
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout = $stdout.TrimEnd("`r", "`n")
        Stderr = $stderr.TrimEnd("`r", "`n")
        Arguments = $Arguments
    }
}

function Get-GitFailureMessage {
    param([Parameter(Mandatory)]$Result)

    $details = @($Result.Stdout, $Result.Stderr) | Where-Object { $_ }
    return "git $($Result.Arguments -join ' ') failed:`n$($details -join [Environment]::NewLine)"
}

function Invoke-RepositoryGit {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $result = Invoke-RepositoryGitResult $Arguments
    if ($result.ExitCode -ne 0) {
        throw (Get-GitFailureMessage $result)
    }
    return $result.Stdout
}

function Read-RepositoryText {
    param([Parameter(Mandatory)][string]$Path)

    $encoding = [System.Text.UTF8Encoding]::new($false)
    return [System.IO.File]::ReadAllText((Resolve-Path (Join-Path $RepositoryRoot $Path)), $encoding)
}

function Write-RepositoryText {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Text
    )

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText((Resolve-Path (Join-Path $RepositoryRoot $Path)), $Text, $encoding)
}

function Save-ReleaseFileSnapshot {
    $snapshot = @{}
    foreach ($path in $ReleaseFiles) {
        $snapshot[$path] = Read-RepositoryText $path
    }
    return $snapshot
}

function Restore-ReleaseFileSnapshot {
    param([Parameter(Mandatory)][hashtable]$Snapshot)

    foreach ($path in $Snapshot.Keys) {
        Write-RepositoryText $path $Snapshot[$path]
    }
    try { Invoke-RepositoryGit (@("restore", "--staged", "--") + $ReleaseFiles) | Out-Null } catch { }
}

function Replace-Text {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$OldValue,
        [Parameter(Mandatory)][string]$NewValue
    )

    $text = Read-RepositoryText $Path
    if (-not $text.Contains($OldValue)) {
        throw "Expected text was not found in ${Path}: $OldValue"
    }
    Write-RepositoryText $Path $text.Replace($OldValue, $NewValue)
}

function Replace-FirstRegexMatches {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Pattern,
        [Parameter(Mandatory)][scriptblock]$Replacement,
        [Parameter(Mandatory)][int]$Count
    )

    $text = Read-RepositoryText $Path
    $regex = [regex]::new($Pattern)
    $matches = @($regex.Matches($text))
    if ($matches.Count -lt $Count) {
        throw "Expected $Count replacements in ${Path}, but found $($matches.Count)."
    }

    $updated = $text
    $selectedMatches = @($matches | Select-Object -First $Count)
    for ($index = $selectedMatches.Count - 1; $index -ge 0; $index -= 1) {
        $match = $selectedMatches[$index]
        $replacementText = [string](& $Replacement $match)
        $updated = $updated.Remove($match.Index, $match.Length).Insert($match.Index, $replacementText)
    }
    Write-RepositoryText $Path $updated
}

function Get-ReleaseNotes {
    param(
        [Parameter(Mandatory)][string]$PreviousTag,
        [Parameter(Mandatory)][string]$TargetLabel
    )

    if ($ReleaseNotes -and $ReleaseNotes.Count -gt 0) {
        return $ReleaseNotes
    }

    $subjectsText = Invoke-RepositoryGit @("log", "--format=%s", "$PreviousTag..HEAD")
    $subjects = @($subjectsText -split "`r?`n" | Where-Object { $_ })
    if ($subjects) {
        return @($subjects | Select-Object -First 8)
    }

    return @("Updated About dialog and app metadata for the $TargetLabel release.")
}

function Format-ReleaseNotes {
    param([Parameter(Mandatory)][string[]]$Notes)

    return ($Notes | ForEach-Object {
        $note = $_.Trim()
        if ($note.StartsWith("- ")) { $note } else { "- $note" }
    }) -join [Environment]::NewLine
}

function Test-LfsPrePushForkFailure {
    param([Parameter(Mandatory)][string]$Message)

    return $Message -match '(?i)(\.git[/\\]hooks[/\\]pre-push|git lfs pre-push)' -and
        $Message -match '(?i)(dofork|fork|resource temporarily unavailable|0xC0000142)'
}

function Test-NoPendingLfsPushObjects {
    $status = Invoke-RepositoryGit @("lfs", "status")
    $insidePushSection = $false
    foreach ($line in ($status -split "`r?`n")) {
        if ($line -match '^Objects to be pushed') {
            $insidePushSection = $true
            continue
        }
        if ($insidePushSection -and $line -match '^Objects ') { break }
        if ($insidePushSection -and $line.Trim()) { return $false }
    }
    return $true
}

function Invoke-RepositoryGitPush {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $result = Invoke-RepositoryGitResult $Arguments
    if ($result.ExitCode -eq 0) { return $result.Stdout }

    $message = Get-GitFailureMessage $result
    if (-not (Test-LfsPrePushForkFailure $message)) { throw $message }
    if (-not (Test-NoPendingLfsPushObjects)) { throw $message }

    Write-Host "Git LFS pre-push hook could not start, and no LFS objects are pending; retrying with --no-verify."
    $retryArguments = @($Arguments[0], "--no-verify") + @($Arguments | Select-Object -Skip 1)
    return Invoke-RepositoryGit $retryArguments
}

function Get-RemoteTagCommit {
    param([Parameter(Mandatory)][string]$Tag)

    $remoteTag = Invoke-RepositoryGit @("ls-remote", "--tags", "origin", "refs/tags/$Tag")
    if (-not $remoteTag) { return "" }
    return (($remoteTag -split "`r?`n" | Select-Object -First 1) -split "\s+")[0]
}

Push-Location $RepositoryRoot
try {
    if (-not (Test-Path (Join-Path $DesktopRoot "package.json"))) {
        throw "desktop-app/package.json was not found. Run this script from the MD-Editor repository layout."
    }

    $branch = (Invoke-RepositoryGit @("rev-parse", "--abbrev-ref", "HEAD")).Trim()
    if ($branch -ne "main") {
        throw "Release promotion must run on main. Current branch is '$branch'."
    }

    Invoke-RepositoryGit @("fetch", "origin", "main", "--tags") | Out-Null

    $status = Invoke-RepositoryGit @("status", "--porcelain")
    if ($status) {
        throw "The worktree must be clean before promoting a version. Commit, stash, or discard unrelated changes first."
    }

    $package = Get-Content (Join-Path $DesktopRoot "package.json") -Raw | ConvertFrom-Json
    $currentVersion = [version]$package.version
    $headCommit = (Invoke-RepositoryGit @("rev-parse", "HEAD")).Trim()
    $originMainCommit = (Invoke-RepositoryGit @("rev-parse", "origin/main")).Trim()
    $headSubject = (Invoke-RepositoryGit @("log", "-1", "--format=%s")).Trim()
    $resumeExistingRelease = $false

    if ($headSubject -match '^Promote version to (\d+\.\d+\.\d+)$') {
        $releaseVersionText = $Matches[1]
        $releaseTag = "v$releaseVersionText"
        $localTagsAtHead = @((Invoke-RepositoryGit @("tag", "--points-at", "HEAD")) -split "`r?`n" | Where-Object { $_ })
        $remoteReleaseTagCommit = Get-RemoteTagCommit $releaseTag
        $localReleaseTagAtHead = $localTagsAtHead -contains $releaseTag
        $remoteReleaseTagAtHead = $remoteReleaseTagCommit -eq $headCommit
        if ($package.version -eq $releaseVersionText -and (($headCommit -ne $originMainCommit) -or -not $remoteReleaseTagAtHead -or -not $localReleaseTagAtHead)) {
            $targetVersion = [version]$releaseVersionText
            $resumeExistingRelease = $true
        }
    }

    if (-not $resumeExistingRelease) {
        if ($Version) {
            $targetVersion = [version]$Version
        }
        elseif ($Bump -eq "major") {
            $targetVersion = [version]"$($currentVersion.Major + 1).0.0"
        }
        else {
            $targetVersion = [version]"$($currentVersion.Major).$($currentVersion.Minor + 1).0"
        }
    }

    $currentVersionText = $currentVersion.ToString()
    $targetVersionText = $targetVersion.ToString()
    $currentLabel = "v$($currentVersion.Major).$($currentVersion.Minor)"
    $targetLabel = "v$($targetVersion.Major).$($targetVersion.Minor)"
    $targetTag = "v$targetVersionText"
    $releaseDateText = $ReleaseDate.ToString("MMMM d, yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
    $remoteTagCommit = Get-RemoteTagCommit $targetTag

    if ($resumeExistingRelease) {
        if ((Invoke-RepositoryGit @("tag", "--list", $targetTag))) {
            $localTagCommit = (Invoke-RepositoryGit @("rev-list", "-n", "1", $targetTag)).Trim()
            if ($localTagCommit -ne $headCommit) {
                throw "Local tag $targetTag does not point at the release commit."
            }
        }
        else {
            Invoke-RepositoryGit @("tag", $targetTag) | Out-Null
        }
        if ($remoteTagCommit -and $remoteTagCommit -ne $headCommit) {
            throw "Remote tag $targetTag already exists and does not point at the release commit."
        }
    }
    else {
        if ((Invoke-RepositoryGit @("tag", "--list", $targetTag))) {
            throw "Local tag $targetTag already exists."
        }
        if ($remoteTagCommit) {
            throw "Remote tag $targetTag already exists."
        }

        $snapshot = Save-ReleaseFileSnapshot
        $releaseCommitted = $false
        try {
            Replace-Text "README.md" "alt=`"Release: $currentLabel`"" "alt=`"Release: $targetLabel`""
            Replace-FirstRegexMatches "desktop-app/package.json" '("version"\s*:\s*")([^"]+)(")' { param($m) "$($m.Groups[1].Value)$targetVersionText$($m.Groups[3].Value)" } 1
            Replace-FirstRegexMatches "desktop-app/package-lock.json" '("version"\s*:\s*")([^"]+)(")' { param($m) "$($m.Groups[1].Value)$targetVersionText$($m.Groups[3].Value)" } 2
            Replace-FirstRegexMatches "desktop-app/neutralino.config.json" '("version"\s*:\s*")([^"]+)(")' { param($m) "$($m.Groups[1].Value)$targetVersionText$($m.Groups[3].Value)" } 1
            Replace-Text "desktop-app/resources/index.html" "<dd id=`"about-app-version`">$currentLabel</dd>" "<dd id=`"about-app-version`">$targetLabel</dd>"
            Replace-FirstRegexMatches "desktop-app/resources/index.html" '(<dd id="about-release-date">)([^<]+)(</dd>)' { param($m) "$($m.Groups[1].Value)$releaseDateText$($m.Groups[3].Value)" } 1
            Replace-Text "desktop-app/resources/js/main.js" "const MD_EDITOR_DESKTOP_VERSION = `"$currentVersionText`";" "const MD_EDITOR_DESKTOP_VERSION = `"$targetVersionText`";"
            Replace-Text "desktop-app/resources/assets/badges/release.svg" "release: $currentLabel" "release: $targetLabel"
            Replace-Text "desktop-app/resources/assets/badges/release.svg" ">$currentLabel<" ">$targetLabel<"

            $notes = Get-ReleaseNotes -PreviousTag "v$currentVersionText" -TargetLabel $targetLabel
            $formattedNotes = Format-ReleaseNotes -Notes $notes
            $releaseText = Read-RepositoryText "desktop-app/help/user/release-notes.md"
            $previousHeading = "## $currentLabel - "
            $headingIndex = $releaseText.IndexOf($previousHeading)
            if ($headingIndex -lt 0) {
                throw "Could not find previous release heading starting with '$previousHeading'."
            }
            $insert = "## $targetLabel - $releaseDateText" + [Environment]::NewLine + [Environment]::NewLine +
                $formattedNotes + [Environment]::NewLine +
                "- Updated About dialog and app metadata for the $targetLabel release." + [Environment]::NewLine + [Environment]::NewLine
            Write-RepositoryText "desktop-app/help/user/release-notes.md" $releaseText.Insert($headingIndex, $insert)

            if (-not $SkipValidation) {
                & npm --prefix desktop-app run check:js
                if ($LASTEXITCODE -ne 0) { throw "npm --prefix desktop-app run check:js failed." }
                & node --check desktop-app\resources\js\main.js
                if ($LASTEXITCODE -ne 0) { throw "node --check desktop-app\resources\js\main.js failed." }
                Invoke-RepositoryGit @("diff", "--check") | Out-Null
            }

            Invoke-RepositoryGit (@("add") + $ReleaseFiles) | Out-Null
            Invoke-RepositoryGit @("diff", "--cached", "--check") | Out-Null
            Invoke-RepositoryGit @("commit", "-m", "Promote version to $targetVersionText") | Out-Null
            $releaseCommitted = $true
            Invoke-RepositoryGit @("tag", $targetTag) | Out-Null
        }
        catch {
            if (-not $releaseCommitted) {
                Restore-ReleaseFileSnapshot $snapshot
            }
            throw
        }
    }

    if (-not $NoPush) {
        Invoke-RepositoryGitPush @("push", "origin", "main") | Out-Null
        if (-not $remoteTagCommit) {
            Invoke-RepositoryGitPush @("push", "origin", $targetTag) | Out-Null
        }
    }

    Write-Host "Promoted MD-Editor to $targetTag."
    if ($NoPush) {
        Write-Host "Commit and tag were created locally but not pushed."
    }
}
finally {
    Pop-Location
}
