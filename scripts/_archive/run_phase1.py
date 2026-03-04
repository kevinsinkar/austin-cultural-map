#!/usr/bin/env python3
"""
Phase 1 Automation Runner - Austin Cultural Map
Simple Python runner that handles setup and executes the automation
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def print_header():
    """Print the automation header"""
    print("=" * 60)
    print("Austin Cultural Map - Phase 1 Automation")
    print("=" * 60)
    print()

def check_environment():
    """Check if environment is properly set up"""
    print("Checking environment...")
    
    # Check GEMINI_API_KEY
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ ERROR: GEMINI_API_KEY environment variable is not set")
        print("Please set your Gemini API key:")
        print()
        if platform.system() == "Windows":
            print("Command Prompt:")
            print("  set GEMINI_API_KEY=your_key_here")
            print()
            print("PowerShell:")
            print('  $env:GEMINI_API_KEY = "your_key_here"')
        else:
            print("  export GEMINI_API_KEY=your_key_here")
        print()
        return False
    
    print("✓ GEMINI_API_KEY found")
    
    # Check Python version
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"❌ ERROR: Python {version.major}.{version.minor} found, need Python 3.8+")
        return False
    
    print(f"✓ Python {version.major}.{version.minor}.{version.micro}")
    
    return True

def install_dependencies():
    """Install required Python packages"""
    print("\nInstalling dependencies...")
    
    try:
        # Try to import required packages first
        import google.generativeai as genai
        print("✓ google-generativeai already installed")
        return True
    except ImportError:
        pass
    
    # Install from requirements.txt
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ], check=True, capture_output=True, text=True)
        
        print("✓ Dependencies installed successfully")
        return True
        
    except subprocess.CalledProcessError as e:
        print("❌ ERROR: Failed to install dependencies")
        print(f"Error: {e.stderr}")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def run_automation():
    """Run the main automation script"""
    print("\nStarting Phase 1 automation...")
    print("This may take several minutes depending on data size...")
    print()
    
    script_path = Path(__file__).parent / "phase1_automation.py"
    
    try:
        result = subprocess.run([
            sys.executable, str(script_path)
        ], check=False, text=True)
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"❌ ERROR: Failed to run automation script: {e}")
        return False

def print_results(success):
    """Print final results"""
    print()
    if success:
        print("✅ Phase 1 automation completed successfully!")
        print("📁 Output files saved to: data/phase1_output/")
        print("📋 Check phase1_completion_report.json for details")
    else:
        print("❌ Phase 1 automation encountered errors")
        print("📋 Check phase1_automation.log for details")
    
    print()
    print("Check the following files for results:")
    print("- data/phase1_output/phase1_completion_report.json")
    print("- data/phase1_output/audited_*_normalized.json")
    print("- phase1_automation.log")
    print()

def main():
    """Main execution function"""
    print_header()
    
    # Check environment
    if not check_environment():
        input("Press Enter to exit...")
        return False
    
    # Install dependencies
    if not install_dependencies():
        input("Press Enter to exit...")
        return False
    
    # Run automation
    success = run_automation()
    
    # Print results
    print_results(success)
    
    if not success:
        input("Press Enter to exit...")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)