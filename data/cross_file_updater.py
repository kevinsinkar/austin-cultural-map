import json
import re
import os
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

FILES = {
    "demographics": "demographics.js",
    "dvi_raw": "dvi_raw.json",
    "geo_tracts": "udp_austin_dvi.geojson",
    "regions": "updated_regions.js"
}

def robust_load_js(filepath, var_name):
    """Safely extracts JS object/array from a file and converts to Python dict/list."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Locate the assignment (e.g., export const NAME = ...)
    start_match = re.search(rf"{var_name}\s*=\s*", content)
    if not start_match:
        raise ValueError(f"Could not find variable {var_name} in {filepath}")
    
    # 2. Extract content between first '[' or '{' and the last closing bracket
    search_area = content[start_match.end():]
    first_bracket = re.search(r'[\[\{]', search_area)
    if not first_bracket:
        raise ValueError(f"No object/array found for {var_name}")
    
    start_idx = start_match.end() + first_bracket.start()
    # Find matching closing bracket at end of file (ignoring trailing whitespace/semicolons)
    end_idx = content.rfind(']') if content.rfind(']') > content.rfind('}') else content.rfind('}')
    js_str = content[start_idx : end_idx + 1]

    # 3. Clean and parse
    try:
        # Try strict JSON first
        return json.loads(js_str)
    except json.JSONDecodeError:
        # Sloppy Fixes for demographics.js (unquoted keys, leading dots)
        # Regex: quote keys ONLY if they aren't already quoted
        js_str = re.sub(r'([{,])\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', js_str)
        js_str = re.sub(r'^{\s*([a-zA-Z_]\w*)\s*:', r'{"\1":', js_str)
        # Regex: fix leading decimals (.48 -> 0.48)
        js_str = re.sub(r'(?<!\d)\.(\d+)', r'0.\1', js_str)
        # Remove trailing commas
        js_str = re.sub(r',\s*([\]}])', r'\1', js_str)
        return json.loads(js_str)

def get_mapping_from_gemini(neighborhoods, target_regions):
    """Maps small neighborhoods to broader demographic regions using Gemini."""
    prompt = f"""
    Map these Austin neighborhoods to the most relevant 'Demographic Region'.
    Target Regions: {target_regions}
    
    Neighborhoods: {neighborhoods}
    
    Return ONLY a JSON object: {{"Neighborhood Name": "Target Region Name"}}.
    If no match, use "Other".
    """
    try:
        response = model.generate_content(prompt)
        data = re.search(r'\{.*\}', response.text, re.DOTALL).group(0)
        return json.loads(data)
    except:
        return {n: "Other" for n in neighborhoods}

def main():
    print("Loading files...")
    demographics = robust_load_js(FILES['demographics'], "DEMOGRAPHICS")
    regions_geojson = robust_load_js(FILES['regions'], "REGIONS_GEOJSON")
    with open(FILES['dvi_raw'], 'r') as f: dvi_raw = json.load(f)
    with open(FILES['geo_tracts'], 'r') as f: geo_tracts = json.load(f)

    # 1. Create a quick lookup for DVI scores and Tract IDs from the geojson
    # Since updated_regions.js and udp_austin_dvi.geojson share geometries:
    tract_lookup = {}
    for feat in geo_tracts['features']:
        props = feat['properties']
        tract_lookup[props.get('name22')] = {
            "dvi": props.get('dvi'),
            "gentrification": props.get('gentrifica'),
            "income": props.get('median_income')
        }

    # 2. Get the 15 broad demographic region names
    target_demo_regions = sorted(list(set(d['region'] for d in demographics)))
    
    print("Mapping neighborhoods to demographic regions via Gemini...")
    neighborhood_names = [f['properties']['region_name'] for f in regions_geojson['features']]
    
    # Process in batches to avoid token limits
    mapping = {}
    for i in range(0, len(neighborhood_names), 30):
        batch = neighborhood_names[i:i+30]
        mapping.update(get_mapping_from_gemini(batch, target_demo_regions))

    print("Updating fields...")
    for i, feature in enumerate(regions_geojson['features']):
        props = feature['properties']
        name = props['region_name']
        
        # Pull Tract ID using index (since geometries match 1:1)
        tract_feat = geo_tracts['features'][i]
        tract_id = tract_feat['properties'].get('name22')
        
        # Field 1: DVI Data
        dvi_info = tract_lookup.get(tract_id, {})
        props['census_tract'] = tract_id
        props['dvi_score'] = dvi_info.get('dvi')
        props['gentrification_status'] = dvi_info.get('gentrification')

        # Field 2: Demographic Trend Data
        matched_demo_region = mapping.get(name, "Other")
        props['demo_planning_region'] = matched_demo_region
        
        # Link latest 2023 demographic stats
        latest_stats = [d for d in demographics if d['region'] == matched_demo_region and d['year'] == 2023]
        if latest_stats:
            s = latest_stats[0]
            props['pop_total_2023'] = s['total']
            props['pct_hispanic'] = s.get('pctHispanic')
            props['pct_black'] = s.get('pctBlack')

    # Save Output
    output_path = "final_updated_regions.js"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"export const REGIONS_GEOJSON = {json.dumps(regions_geojson, indent=2)};")
    
    print(f"Done! Updated file saved to {output_path}")

if __name__ == "__main__":
    main()