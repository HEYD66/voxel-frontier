param(
    [Parameter(Mandatory = $true)]
    [string] $ProjectRoot
)

$ErrorActionPreference = 'Stop'

function Convert-UnicodeText {
    param([Parameter(Mandatory = $true)][string] $Value)
    return [System.Text.RegularExpressions.Regex]::Replace(
        $Value,
        '\\u([0-9a-fA-F]{4})',
        { param($Match) [char][Convert]::ToInt32($Match.Groups[1].Value, 16) }
    )
}

function Write-LauncherMessage {
    param(
        [Parameter(Mandatory = $true)][string] $Value,
        [ConsoleColor] $Color = [ConsoleColor]::Gray
    )
    Write-Host (Convert-UnicodeText $Value) -ForegroundColor $Color
}

function Wait-BeforeClose {
    if ($env:VOXEL_LAUNCHER_NO_PAUSE -ne '1') {
        Write-Host
        [void](Read-Host (Convert-UnicodeText '\u6309 Enter \u952e\u5173\u95ed\u6b64\u7a97\u53e3...'))
    }
}

function Stop-WithError {
    param([Parameter(Mandatory = $true)][string] $Message)
    Write-Host
    Write-LauncherMessage ('[\u9519\u8bef] ' + $Message) Red
    Wait-BeforeClose
    exit 1
}

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    & chcp.com 65001 | Out-Null
    [Console]::Title = Convert-UnicodeText 'Voxel Frontier \u4e00\u952e\u542f\u52a8\u5668'
} catch {
    # The launcher still works when a redirected console cannot change its encoding or title.
}

Write-Host
Write-Host '========================================' -ForegroundColor Cyan
Write-LauncherMessage '       Voxel Frontier \u4e00\u952e\u542f\u52a8\u5668' Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host

try {
    Set-Location -LiteralPath $ProjectRoot
} catch {
    Stop-WithError ('\u65e0\u6cd5\u8fdb\u5165\u6e38\u620f\u9879\u76ee\u76ee\u5f55\uff1a' + $ProjectRoot)
}

if (-not (Test-Path -LiteralPath 'package.json' -PathType Leaf)) {
    Stop-WithError '\u5f53\u524d\u76ee\u5f55\u4e0d\u662f\u5b8c\u6574\u7684\u6e38\u620f\u9879\u76ee\uff0c\u7f3a\u5c11 package.json\u3002'
}

$nodeCommand = Get-Command 'node.exe' -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    Write-LauncherMessage '\u4e0b\u8f7d\u5730\u5740\uff1ahttps://nodejs.org/' Yellow
    Stop-WithError '\u672a\u68c0\u6d4b\u5230 Node.js\u3002\u8bf7\u5b89\u88c5 Node.js 22 LTS \u6216\u66f4\u9ad8\u7248\u672c\uff0c\u7136\u540e\u91cd\u65b0\u8fd0\u884c\u542f\u52a8\u5668\u3002'
}

$npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
    Stop-WithError '\u5df2\u627e\u5230 Node.js\uff0c\u4f46\u672a\u68c0\u6d4b\u5230 npm\u3002\u8bf7\u91cd\u65b0\u5b89\u88c5\u5305\u542b npm \u7684 Node.js 22 LTS\u3002'
}

try {
    $nodeVersionText = ((& $nodeCommand.Source --version) | Select-Object -First 1).Trim().TrimStart('v')
    $nodeVersion = [Version]$nodeVersionText
} catch {
    Stop-WithError ('\u542f\u52a8\u5668\u9047\u5230\u672a\u77e5\u9519\u8bef\uff1a' + $_.Exception.Message)
}

Write-LauncherMessage ('[\u68c0\u67e5] Node.js ' + $nodeVersionText) Green

$nodeIsSupported =
    ($nodeVersion.Major -eq 20 -and $nodeVersion.Minor -ge 19) -or
    ($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 12) -or
    ($nodeVersion.Major -gt 22)

if (-not $nodeIsSupported) {
    Write-LauncherMessage '\u8bf7\u5347\u7ea7\u5230 Node.js 22.12 \u6216\u66f4\u9ad8\u7248\u672c\uff08\u63a8\u8350\u6700\u65b0 LTS\uff09\u3002' Yellow
    Write-LauncherMessage '\u4e0b\u8f7d\u5730\u5740\uff1ahttps://nodejs.org/' Yellow
    Stop-WithError (('\u5f53\u524d Node.js \u7248\u672c {0} \u4e0d\u53d7 Vite 7 \u652f\u6301\u3002' -f $nodeVersionText))
}

$viteLauncher = Join-Path $ProjectRoot 'node_modules\.bin\vite.cmd'
$installMarker = Join-Path $ProjectRoot 'node_modules\.package-lock.json'
$needsInstall = -not (Test-Path -LiteralPath $viteLauncher -PathType Leaf)

if (-not $needsInstall) {
    if (-not (Test-Path -LiteralPath $installMarker -PathType Leaf)) {
        $needsInstall = $true
    } else {
        $markerTime = (Get-Item -LiteralPath $installMarker).LastWriteTimeUtc
        foreach ($manifestName in @('package.json', 'package-lock.json')) {
            $manifestPath = Join-Path $ProjectRoot $manifestName
            if ((Test-Path -LiteralPath $manifestPath -PathType Leaf) -and
                (Get-Item -LiteralPath $manifestPath).LastWriteTimeUtc -gt $markerTime) {
                $needsInstall = $true
                break
            }
        }
    }
}

if ($needsInstall) {
    Write-LauncherMessage '[\u51c6\u5907] \u6b63\u5728\u5b89\u88c5\u6216\u66f4\u65b0\u9879\u76ee\u4f9d\u8d56\uff0c\u8bf7\u7a0d\u5019...' Yellow
    & $npmCommand.Source install --no-audit --no-fund
    $installExitCode = $LASTEXITCODE
    if ($installExitCode -ne 0) {
        Stop-WithError (('\u4f9d\u8d56\u5b89\u88c5\u5931\u8d25\uff0cnpm \u8fd4\u56de\u9519\u8bef\u4ee3\u7801 {0}\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001npm \u955c\u50cf\u914d\u7f6e\u53ca\u4e0a\u65b9\u65e5\u5fd7\u3002' -f $installExitCode))
    }
    Write-LauncherMessage '[\u5b8c\u6210] \u9879\u76ee\u4f9d\u8d56\u5df2\u5c31\u7eea\u3002' Green
} else {
    Write-LauncherMessage '[\u68c0\u67e5] \u9879\u76ee\u4f9d\u8d56\u5df2\u5c31\u7eea\u3002' Green
}

if (-not (Test-Path -LiteralPath $viteLauncher -PathType Leaf)) {
    Stop-WithError '\u4f9d\u8d56\u5b89\u88c5\u540e\u4ecd\u672a\u627e\u5230 Vite \u542f\u52a8\u7a0b\u5e8f\u3002\u53ef\u5728\u9879\u76ee\u76ee\u5f55\u8fd0\u884c npm install \u67e5\u770b\u8be6\u7ec6\u9519\u8bef\u3002'
}

Write-Host
Write-LauncherMessage '[\u542f\u52a8] \u6e38\u620f\u5373\u5c06\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00\u3002' Cyan
Write-LauncherMessage '[\u7aef\u53e3] \u4f18\u5148\u4f7f\u7528 5173\uff1b\u82e5\u5df2\u5360\u7528\uff0cVite \u5c06\u81ea\u52a8\u9009\u62e9\u540e\u7eed\u53ef\u7528\u7aef\u53e3\u3002' Cyan
Write-LauncherMessage '[\u505c\u6b62] \u56de\u5230\u6b64\u7a97\u53e3\u6309 Ctrl+C \u5373\u53ef\u5173\u95ed\u670d\u52a1\u5668\u3002' Cyan
Write-Host

try {
    & $npmCommand.Source run dev -- --host 127.0.0.1 --port 5173 --open
    $serverExitCode = $LASTEXITCODE
} catch {
    Stop-WithError ('\u542f\u52a8\u5668\u9047\u5230\u672a\u77e5\u9519\u8bef\uff1a' + $_.Exception.Message)
}

Write-Host
if ($serverExitCode -eq 0 -or $serverExitCode -eq 130 -or $serverExitCode -eq -1073741510) {
    Write-LauncherMessage '[\u7ed3\u675f] \u6e38\u620f\u670d\u52a1\u5668\u5df2\u505c\u6b62\u3002' Green
    Wait-BeforeClose
    exit 0
}

Stop-WithError (('\u6e38\u620f\u670d\u52a1\u5668\u5f02\u5e38\u9000\u51fa\uff0c\u9519\u8bef\u4ee3\u7801\uff1a{0}\u3002\u8bf7\u67e5\u770b\u4e0a\u65b9\u65e5\u5fd7\u5b9a\u4f4d\u95ee\u9898\u3002' -f $serverExitCode))
