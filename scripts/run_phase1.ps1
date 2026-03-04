# Phase 1 Automation Runner for Austin Cultural Map
# PowerShell version with better error handling

Write-Host "========================================"
Write-Host "Austin Cultural Map - Phase 1 Automation"
Write-Host "========================================"
Write-Host ""

# Check if GEMINI_API_KEY is set
if (-not $env:GEMINI_API_KEY) {
    Write-Host "ERROR: GEMINI_API_KEY environment variable is not set" -ForegroundColor Red
    Write-Host "Please set your Gemini API key:"
    Write-Host '  $env:GEMINI_API_KEY = "your_key_here"'
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ GEMINI_API_KEY environment variable found" -ForegroundColor Green
Write-Host ""

# Check if Python is available
$pythonCheck = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCheck) {
    Write-Host "ERROR: Python not found in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.8+ or add it to your PATH"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$pythonVersion = python --version 2>&1
Write-Host "✓ Python installation found" -ForegroundColor Green
Write-Host $pythonVersion
Write-Host ""

# Install dependencies
Write-Host "Installing Python dependencies..."
$pipResult = pip install -r requirements.txt 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    Write-Host $pipResult
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
Write-Host ""

# Run the automation script
Write-Host "Starting Phase 1 automation..."
Write-Host "This may take several minutes depending on data size..."
Write-Host ""

$automationResult = python phase1_automation.py 2>&1
$automationExitCode = $LASTEXITCODE

if ($automationExitCode -eq 0) {
    Write-Host ""
    Write-Host "✅ Phase 1 automation completed successfully" -ForegroundColor Green
    Write-Host "Check data/phase1_output/ for results"
} else {
    Write-Host ""
    Write-Host "❌ Phase 1 automation encountered errors" -ForegroundColor Red
    Write-Host "Check phase1_automation.log for details"
    Write-Host "Error output:"
    Write-Host $automationResult
}

Write-Host ""
Write-Host "Check the following files for results:"
Write-Host "- data/phase1_output/phase1_completion_report.json"
Write-Host "- data/phase1_output/audited_*_normalized.json"
Write-Host "- phase1_automation.log"
Write-Host ""

Read-Host "Press Enter to exit"