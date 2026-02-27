import os
import json
import re
import time
import google.generativeai as genai
from google.api_core import exceptions

# --- CONFIGURATION ---
API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

# Input File
REGIONS_FILE = 'final_updated_regions.js'

# Separate Interim Output Files
INTERIM_FILES = {
    "demographics": "interim_demographics.json",
    "property": "interim_property.json",
    "socioeconomic": "interim_socioeconomic.json",
    "progress": "generation_checkpoint.json" # Tracks completed region names
}

# --- RATE LIMIT SETTINGS ---
# Increase this if you continue to hit daily limits early
SECONDS_BETWEEN_REGIONS = 12 
MAX_RETRIES = 3

def extract_json_from_js(filepath, var_name):
    """Extracts the JSON content assigned to a JS constant."""
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'r') as f:
        content = f.read()
    match = re.search(rf'export const {var_name}\s*=\s*(.*);', content, re.DOTALL)
    if match:
        raw_data = match.group(1).strip()
        try:
            return json.loads(raw_data)
        except:
            raw_data = raw_data.replace("'", '"')
            raw_data = re.sub(r',\s*([\]}])', r'\1', raw_data)
            return json.loads(raw_data)
    return None

def load_interim_data(key):
    """Loads existing data for a specific category from its interim file."""
    filename = INTERIM_FILES[key]
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            return json.load(f)
    return []

def load_completed_list():
    """Loads the list of regions already processed."""
    if os.path.exists(INTERIM_FILES["progress"]):
        with open(INTERIM_FILES["progress"], 'r') as f:
            return json.load(f)
    return []

def save_interim_data(key, data):
    """Saves a category's list to its specific interim file."""
    with open(INTERIM_FILES[key], 'w') as f:
        json.dump(data, f, indent=2)

def save_completed_list(completed_regions):
    """Saves the checkpoint list of completed region names."""
    with open(INTERIM_FILES["progress"], 'w') as f:
        json.dump(completed_regions, f, indent=2)

def generate_region_updates(region_name, heritage):
    """Calls Gemini with retry logic for 429 errors."""
    prompt = f"""
    Generate historical and projected data for the Austin region: "{region_name}".
    Heritage context: {heritage}
    
    Provide data for years 1990-2025.
    Return ONLY a valid JSON object with these exact keys: "demographics", "property", "socioeconomic".
    
    IMPORTANT: Each item in the lists MUST be an object (dictionary).
    Example format: 
    "demographics": [{{ "year": 1990, "total": 5000, ... }}]
    """
    
    for attempt in range(MAX_RETRIES):
        try:
            response = model.generate_content(prompt)
            clean_text = re.sub(r'```json|```', '', response.text).strip()
            return json.loads(clean_text)
        except exceptions.ResourceExhausted:
            # This handles your "Quota Exceeded" 429 error
            wait_time = (attempt + 1) * 75 
            print(f"!! Quota Exceeded. Sleeping {wait_time}s before retry {attempt+1}/{MAX_RETRIES}...")
            time.sleep(wait_time)
        except Exception as e:
            print(f"Non-quota error for {region_name}: {e}")
            break
    return None

def main():
    regions_data = extract_json_from_js(REGIONS_FILE, 'REGIONS_GEOJSON')
    if not regions_data:
        print("Error: Could not find REGIONS_GEOJSON in the specified file.")
        return

    # Load existing interim data to append to
    all_data = {
        "demographics": load_interim_data("demographics"),
        "property": load_interim_data("property"),
        "socioeconomic": load_interim_data("socioeconomic")
    }
    completed_regions = load_completed_list()
    
    for feature in regions_data['features']:
        region_name = feature['properties']['region_name']
        heritage = feature['properties'].get('heritage', 'N/A')
        
        if region_name in completed_regions:
            print(f"Skipping {region_name} (Checkpoint found).")
            continue
        
        print(f"Requesting data for: {region_name}...")
        updates = generate_region_updates(region_name, heritage)
        
        if updates:
            for key in ["demographics", "property", "socioeconomic"]:
                if key in updates and isinstance(updates[key], list):
                    for entry in updates[key]:
                        # Check if entry is a dictionary before assigning
                        if isinstance(entry, dict):
                            entry['region'] = region_name
                        else:
                            print(f"Warning: Expected dict in {key}, but got {type(entry)}: {entry}")
                            continue 
                    
                    all_data[key].extend([e for e in updates[key] if isinstance(e, dict)])
                    save_interim_data(key, all_data[key])
            
            # Update checkpoint
            completed_regions.append(region_name)
            save_completed_list(completed_regions)
            
            print(f"Saved {region_name} to interim files.")
            time.sleep(SECONDS_BETWEEN_REGIONS)
        else:
            print(f"Failed to retrieve data for {region_name} after retries. Stopping script.")
            break

    print("\nProcessing complete.")
    print(f"Data stored in: {list(INTERIM_FILES.values())}")

if __name__ == "__main__":
    main()