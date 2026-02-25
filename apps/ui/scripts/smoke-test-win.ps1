# Windows Smoke Test Installation Script
#
# This script:
# 1. Finds the NSIS installer (.exe)
# 2. Runs silent installation to C:\test-app
# 3. Verifies the executable exists
#
# Expected environment:
#   ARTIFACT_DIR - Directory containing the .exe file (default: artifacts/windows)

$ErrorActionPreference = "Stop"

$ARTIFACT_DIR = if ($env:ARTIFACT_DIR) { $env:ARTIFACT_DIR } else { "artifacts/windows" }
$TEST_APP_DIR = "C:\test-app"

Write-Host "=== Windows Smoke Test Installation ===" -ForegroundColor Cyan

# Find the NSIS installer
$installerFile = Get-ChildItem -Path $ARTIFACT_DIR -Filter "*.exe" -File | Select-Object -First 1

if (-not $installerFile) {
    Write-Host "❌ Error: No .exe installer found in $ARTIFACT_DIR" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found installer: $($installerFile.FullName)" -ForegroundColor Green

# Remove existing test directory
if (Test-Path $TEST_APP_DIR) {
    Write-Host "🗑️  Removing existing test directory..." -ForegroundColor Yellow
    Remove-Item -Path $TEST_APP_DIR -Recurse -Force
}

# Run silent installation
Write-Host "📦 Running silent installation to $TEST_APP_DIR..." -ForegroundColor Cyan
$installArgs = @("/S", "/D=$TEST_APP_DIR")
Start-Process -FilePath $installerFile.FullName -ArgumentList $installArgs -Wait -NoNewWindow

# Verify executable exists
$exePath = Join-Path $TEST_APP_DIR "protoLabs.studio.exe"

if (-not (Test-Path $exePath)) {
    Write-Host "❌ Error: Executable not found at $exePath" -ForegroundColor Red
    Write-Host "   Installation may have failed." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host "   Executable: $exePath" -ForegroundColor Green
