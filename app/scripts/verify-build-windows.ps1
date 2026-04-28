# Copyright 2025 The Kubernetes Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Verify Windows build artifacts and binaries
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Split-Path -Parent $scriptDir
$distDir = Join-Path $appDir "dist"

# Function to test backend binary
function Test-BackendBinary {
  param($backendPath)
  
  # Ensure we have a string path (handle both string and FileInfo objects)
  if ($backendPath -is [System.IO.FileInfo]) {
    $backendPath = $backendPath.FullName
  } elseif ($backendPath -isnot [string]) {
    Write-Host "[FAIL] Invalid backend path type: expected string or FileInfo, got $($backendPath.GetType().Name)" -ForegroundColor Red
    exit 1
  }
  
  Write-Host "Found backend at: $backendPath"
  # Backend logs to stderr, so we need to handle that gracefully
  # Use Start-Process to isolate stderr handling and get clean exit code
  $tempOutput = [System.IO.Path]::GetTempFileName()
  $tempError = [System.IO.Path]::GetTempFileName()
  try {
    $proc = Start-Process -FilePath $backendPath -ArgumentList "--version" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tempOutput -RedirectStandardError $tempError -ErrorAction Stop
    $exitCode = $proc.ExitCode
    $versionOutput = Get-Content $tempOutput -Raw
    if (-not $versionOutput) {
      $versionOutput = ""
    }
  } catch {
    Write-Host "[FAIL] Failed to execute backend at ${backendPath}: $_" -ForegroundColor Red
    exit 1
  } finally {
    if (Test-Path $tempOutput) { Remove-Item $tempOutput -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempError) { Remove-Item $tempError -Force -ErrorAction SilentlyContinue }
  }
  if ($exitCode -ne 0) {
    Write-Host "[FAIL] Backend version command failed with exit code $exitCode" -ForegroundColor Red
    exit $exitCode
  }
  Write-Host "Backend version: $versionOutput"
  if (-not $versionOutput -or -not ($versionOutput -match "Headlamp")) {
    if (-not $versionOutput) {
      Write-Host "[FAIL] Backend produced no version output" -ForegroundColor Red
    } else {
      Write-Host "[FAIL] Backend version check failed - output does not contain 'Headlamp'" -ForegroundColor Red
    }
    exit 1
  }
  Write-Host "[PASS] Backend binary is working" -ForegroundColor Green
  return $true
}

Write-Host "=== Verifying Windows Build Artifacts ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify artifacts exist
Write-Host "Checking for built artifacts..."
if (-not (Test-Path $distDir)) {
  Write-Host "[FAIL] dist directory not found at path: $distDir" -ForegroundColor Red
  exit 1
}
Get-ChildItem $distDir | Format-Table

$installers = Get-ChildItem "$distDir\*.exe" -ErrorAction SilentlyContinue
if ($installers) {
  Write-Host "[PASS] Windows installer found" -ForegroundColor Green
} else {
  Write-Host "[FAIL] No Windows installer found" -ForegroundColor Red
  exit 1
}
Write-Host ""

# Step 2: Verify backend binary in unpacked resources
Write-Host "=== Verifying Backend Binary ===" -ForegroundColor Cyan
$unpackedDir = Join-Path $distDir "win-unpacked"
$appPath = $null

if (Test-Path $unpackedDir) {
  Write-Host "Found unpacked build directory"
  $backendPath = Join-Path $unpackedDir "resources\headlamp-server.exe"
  if (Test-Path $backendPath) {
    Test-BackendBinary $backendPath
    $appPath = Join-Path $unpackedDir "Headlamp.exe"
  } else {
    Write-Host "[FAIL] Backend server binary not found in unpacked resources" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "Unpacked directory not found, checking in build output..." -ForegroundColor Yellow
  $backendPath = Get-ChildItem -Path $distDir -Recurse -Filter "headlamp-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($backendPath) {
    Test-BackendBinary $backendPath.FullName
    # Try to find the app executable in the dist output
    $appPath = Get-ChildItem -Path $distDir -Recurse -Filter "Headlamp.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 | Select-Object -ExpandProperty FullName
  } else {
    Write-Host "[FAIL] Could not find backend binary to test in dist output" -ForegroundColor Red
    exit 1
  }
}
Write-Host ""

# Step 3: Verify Electron app can run
Write-Host "=== Verifying Electron App ===" -ForegroundColor Cyan
if ($appPath -and (Test-Path $appPath)) {
  Write-Host "Testing Electron app..."
  Write-Host "Found Headlamp at: $appPath"
  
  # Initialize tempDir outside try block so it's accessible in catch/finally
  $tempDir = $null
  
  try {
    # Create a unique temp directory for this run
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $outputFile = Join-Path $tempDir "plugins-output.txt"
    $errorFile = Join-Path $tempDir "plugins-error.txt"
    
    # Run with timeout (30 seconds) using Start-Process for process control
    try {
      $process = Start-Process -FilePath $appPath -ArgumentList "list-plugins" -PassThru -RedirectStandardOutput $outputFile -RedirectStandardError $errorFile -ErrorAction Stop
    } catch {
      Write-Host "[FAIL] Failed to start app: $_" -ForegroundColor Red
      throw $_  # Re-throw with original context
    }
    
    # Wait with timeout
    $completed = $process.WaitForExit(30000)  # 30 seconds in milliseconds
    
    if ($completed) {
      # Process completed within timeout - check exit code
      # Ensure process has fully exited before reading ExitCode
      $process.WaitForExit()
      $exitCode = $process.ExitCode
      
      # Add diagnostics for exit code
      Write-Host "DEBUG: Process HasExited = $($process.HasExited), ExitCode = $exitCode"
      
      # Handle null exit code (treat as 0 if process completed successfully)
      if ($null -eq $exitCode) {
        Write-Host "WARNING: Exit code was null, checking if process actually completed..."
        if ($process.HasExited) {
          Write-Host "Process has exited, treating as success (exit code 0)"
          $exitCode = 0
        } else {
          Write-Host "[FAIL] Process state is ambiguous" -ForegroundColor Red
          exit 1
        }
      }
      
      # Check if the app ran successfully
      if ($exitCode -eq 0) {
        Write-Host "[PASS] App executed successfully" -ForegroundColor Green
        if (Test-Path $outputFile) {
          Get-Content $outputFile
        }
      } else {
        Write-Host "[FAIL] App failed to run (exit code: $exitCode)" -ForegroundColor Red
        if (Test-Path $outputFile) {
          Write-Host "Standard output:"
          Get-Content $outputFile
        }
        if (Test-Path $errorFile) {
          Write-Host "Standard error:"
          Get-Content $errorFile
        }
        exit 1
      }
    } else {
      Write-Host "[FAIL] App timed out after 30 seconds" -ForegroundColor Red
      # Kill the process
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      # Give it a moment to clean up
      Start-Sleep -Milliseconds 500
      exit 1
    }
  } catch {
    Write-Host "[FAIL] Error running app: $_" -ForegroundColor Red
    exit 1
  } finally {
    # Cleanup temp directory in all cases
    if ($tempDir -and (Test-Path $tempDir)) {
      Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host "[FAIL] Could not find Headlamp.exe for app verification" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "[PASS] All Windows verification checks passed" -ForegroundColor Green

