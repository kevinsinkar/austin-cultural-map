import os
import json
import re
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

# File paths
REGIONS_FILE = 'final_updated_regions.js'
DEMO_FILE = 'demographics.js'
PROP_FILE = 'propertyData.js'
SOCIO_FILE = 'socioeconomic.js'

def extract_json_from_js(filepath, var_name):
    """Extracts the JSON/List content assigned to a JS constant."""
    with open(filepath, 'r') as f:
        content = f.read()
    # Simple regex to find content after 'export const VAR_NAME = '
    match = re.search(rf'export const {var_name}\s*=\s*(.*);', content, re.DOTALL)
    if match:
        raw_data = match.group(1).strip()
        # Note: This works best if the JS content is valid JSON-like (e.g. no functions)
        # For complex JS objects, consider a proper JS parser if this fails.
        try:
            return json.loads(raw_data)
        except:
            # If not valid JSON (e.g. uses single quotes), attempt simple cleanup
            raw_data = raw_data.replace("'", '"')
            # Remove trailing commas before closing brackets/braces
            raw_data = re.sub(r',\s*([\]}])', r'\1', raw_data)
            return json.loads(raw_data)
    return None

def save_to_js(filepath, var_name, data):
    """Saves data back to JS file with export constant."""
    with open(filepath, 'w') as f:
        f.write(f"export const {var_name} = ")
        json.dump(data, f, indent=2)
        f.write(";\n")

def generate_region_updates(region_name, heritage):
    """Calls Gemini to generate data entries for a specific region."""
    prompt = f"""
    Act as a data analyst specializing in Austin, Texas urban development and demographics.
    Generate historical and projected data for the region: "{region_name}".
    Heritage description: {heritage}

    Tasks:
    1. Generate DEMOGRAPHICS entries for years: 1990, 2000, 2010, 2020, 2023, 2025.
       Fields: total, pctWhite, pctBlack, pctHispanic, pctAsian, pctOther, popBlack, popHispanic, popWhite.
    2. Generate PROPERTY_DATA entries for years: 2005, 2010, 2015, 2020, 2023, 2025.
       Fields: value (median home), homestead (decimal), demos, newBuild, yoy (decimal).
    3. Generate SOCIOECONOMIC entries for years: 2000, 2010, 2020, 2023, 2025.
       Fields: incomeAdj, homeValue, pctBachelors, pctCostBurdened, confidence.

    Ensure data trends are realistic based on the heritage description (e.g., gentrification patterns in Austin).
    Return ONLY a valid JSON object with three keys: "demographics", "property", and "socioeconomic".
    Do not include markdown formatting or backticks.
    """
    
    response = model.generate_content(prompt)
    try:
        # Clean response text in case Gemini adds markdown code blocks
        clean_text = re.sub(r'```json|```', '', response.text).strip()
        return json.loads(clean_text)
    except Exception as e:
        print(f"Error parsing Gemini response for {region_name}: {e}")
        return None

def main():
    # 1. Load regions
    regions_data = extract_json_from_js(REGIONS_FILE, 'REGIONS_GEOJSON')
    if not regions_data:
        print("Failed to load regions.")
        return

    # 2. Extract existing data to append to
    all_demographics = []
    all_property = []
    all_socio = []

    # 3. Iterate through regions
    for feature in regions_data['features']:
        props = feature['properties']
        region_name = props['region_name']
        heritage = props.get('heritage', 'N/A')
        
        print(f"Processing data for: {region_name}...")
        
        updates = generate_region_updates(region_name, heritage)
        if updates:
            # Add region name to generated items and append
            for item in updates['demographics']:
                item['region'] = region_name
                all_demographics.append(item)
            for item in updates['property']:
                item['region'] = region_name
                all_property.append(item)
            for item in updates['socioeconomic']:
                item['region'] = region_name
                all_socio.append(item)

    # 4. Save results
    save_to_js(DEMO_FILE, 'DEMOGRAPHICS', all_demographics)
    save_to_js(PROP_FILE, 'PROPERTY_DATA', all_property)
    save_to_js(SOCIO_FILE, 'SOCIOECONOMIC', all_socio)
    print("Updates complete.")

if __name__ == "__main__":
    main()