@echo off
REM Phase 1 Automation Runner for Austin Cultural Map
REM Ensures environment is set up and runs the automation

echo ========================================
echo Austin Cultural Map - Phase 1 Automation
echo ========================================
echo.

REM Check if GEMINI_API_KEY is set
if "%GEMINI_API_KEY%"=="" (
    echo ERROR: GEMINI_API_KEY environment variable is not set
    echo Please set your Gemini API key:
    echo   set GEMINI_API_KEY=your_key_here
    echo.
    pause
    exit /b 1
)

echo ✓ GEMINI_API_KEY environment variable found
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo Please install Python 3.8+ or add it to your PATH
    echo.
    pause
    exit /b 1
)

echo ✓ Python installation found
python --version
echo.

REM Install dependencies 
echo Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    echo.
    pause
    exit /b 1
)

echo ✓ Dependencies installed successfully
echo.

REM Run the automation script
echo Starting Phase 1 automation...
echo This may take several minutes depending on data size...
echo.

python phase1_automation.py

if errorlevel 1 (
    echo.
    echo ❌ Phase 1 automation encountered errors
    echo Check phase1_automation.log for details
) else (
    echo.
    echo ✅ Phase 1 automation completed successfully
    echo Check data/phase1_output/ for results
)

echo.
echo Check the following files for results:
echo - data/phase1_output/phase1_completion_report.json
echo - data/phase1_output/audited_*_normalized.json
echo - phase1_automation.log
echo.
pause