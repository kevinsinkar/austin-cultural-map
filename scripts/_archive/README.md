# Austin Cultural Map - Phase 1 Automation Scripts

This directory contains scripts to automate **Phase 1 - Data Integrity** tasks from the [`agent-todo-list.md`](../agent-todo-list.md) using the Gemini 2.5-fast API.

## 🎯 What This Automates

**Phase 1 Tasks:**
1. **Task 1.1** - Normalize demographic field names (20+ variants → canonical names)
2. **Task 1.2** - Normalize property field names (15+ variants → canonical names)  
3. **Task 1.3** - Normalize socioeconomic field names (10+ variants → canonical names)
4. **Task 1.4** - Validate region-to-tract mapping and generate documentation
5. **Task 1.5** - Add rent burden metric to RegionDetailPanel component

## 🚀 Quick Start

### Prerequisites

1. **Python 3.8+** installed and in your PATH
2. **Gemini API Key** stored in environment variable `GEMINI_API_KEY`

### Set Up API Key

**Windows Command Prompt:**
```cmd
set GEMINI_API_KEY=your_api_key_here
```

**Windows PowerShell:**
```powershell
$env:GEMINI_API_KEY = "your_api_key_here"
```

**Permanent (Windows):**
1. Open System Properties → Advanced → Environment Variables
2. Add `GEMINI_API_KEY` with your API key value

### Run Automation

**Simple Python runner (Recommended):**
```bash
cd scripts
python run_phase1.py
```

**Direct execution:**
```bash
cd scripts
pip install -r requirements.txt
python phase1_automation.py
```

## 📁 Output Files

After successful completion, check:

```
data/
└── phase1_output/
    ├── phase1_completion_report.json          # Summary of all tasks
    ├── audited_demographics_normalized.json   # Task 1.1 output
    ├── audited_property_normalized.json       # Task 1.2 output  
    ├── audited_socioeconomic_normalized.json  # Task 1.3 output
    ├── region_tract_mapping.json              # Task 1.4 output
    ├── task_1_1_normalization_log.json        # Detailed logs
    ├── task_1_2_normalization_log.json
    ├── task_1_3_normalization_log.json
    └── RegionDetailPanel_backup.jsx           # UI backup
```

Plus in the root directory:
- `phase1_automation.log` - Detailed execution log

## 🔧 How It Works

### Field Normalization Process

For each data file (`demographics`, `property`, `socioeconomic`):

1. **Scan** each record for canonical fields and variants
2. **Detect conflicts** when multiple variants exist for the same concept
3. **Resolve conflicts** using Gemini API with domain expertise
4. **Normalize scale** for percentage fields (0-100 → 0-1 as needed)
5. **Clean up** by removing duplicate variant fields
6. **Log changes** for audit trail

### Gemini API Integration

The script uses **Gemini 2.0-flash-exp** model with:
- **Low temperature** (0.1) for consistent data decisions
- **Domain-specific prompts** based on Austin demographic expertise
- **Conflict resolution** preferring more specific field names
- **Scale validation** matching app expectations

### Example Field Normalization

**Before:**
```json
{
  "hispanic_pct": 45.2,
  "hispanic_percentage": 45.1,
  "pct_hispanic": null,
  "black_non_hispanic_pct": 15.3,
  "pct_black_non_hispanic": null
}
```

**After:**  
```json
{
  "pct_hispanic": 45.2,
  "pct_black_non_hispanic": 15.3
}
```

## 📊 Expected Results

### Success Metrics

- **~3,000+ records** normalized across demographics
- **~2,000+ records** normalized across property data
- **~1,500+ records** normalized across socioeconomic data
- **Zero silent N/A values** where data exists under variants
- **Consistent percentage scales** (0-1) matching app expectations

### UI Enhancement

The script automatically updates [`components/RegionDetailPanel.jsx`](../components/RegionDetailPanel.jsx) to add:

- **Rent burden card** showing percentage of cost-burdened renters
- **Proper formatting** as percentage with trend arrows
- **Fallback handling** for missing data
- **Contextual subtitle** explaining the 30% income threshold

## 🚨 Troubleshooting

### Common Issues

**`GEMINI_API_KEY not set`**
- Verify environment variable: `echo %GEMINI_API_KEY%` (cmd) or `$env:GEMINI_API_KEY` (PS)
- Restart terminal after setting environment variable

**`ModuleNotFoundError: google.generativeai`**  
- Run: `pip install -r requirements.txt`
- Verify Python version: `python --version` (need 3.8+)

**`FileNotFoundError: audited_*.json`**
- Ensure audit output files exist in `data/audit_output/`
- Run data audit process first if missing

**API Rate Limiting**
- Script includes automatic retry logic
- Large datasets may take 10-15 minutes to process
- Check `phase1_automation.log` for progress

### Manual Verification

After automation completes:

1. **Check normalization logs** for any conflicts requiring review
2. **Verify RegionDetailPanel** displays rent burden correctly
3. **Update About modal** text based on region mapping analysis
4. **Test data integrity** by spot-checking a few regions in the UI

## 🔄 What's Next

After Phase 1 completion:

1. **Review** normalization conflict logs for any manual corrections needed
2. **Test** the updated RegionDetailPanel with rent burden display
3. **Update** About modal text using recommendations from `region_tract_mapping.json`
4. **Proceed** to Phase 2 automation (grant triage features)

## 📝 File Descriptions

| File | Purpose |
|------|---------|
| `phase1_automation.py` | Main automation script with all 5 tasks |
| `run_phase1.py` | Python runner with environment validation and setup |
| `requirements.txt` | Python dependencies for Gemini API |
| `README.md` | This documentation file |

## 🤝 Contributing

To modify or extend the automation:

1. **Field mappings** are defined in the `Phase1Automator` class dictionaries
2. **Gemini prompts** can be customized in the respective task methods
3. **Output formats** follow the existing audit log structure
4. **Add new tasks** by creating additional `task_X_X` methods

---

**Need help?** Check the execution log at `phase1_automation.log` or the detailed task logs in `data/phase1_output/`.