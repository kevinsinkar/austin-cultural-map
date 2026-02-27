import google.generativeai as genai
import json
import re
import ast
import os

# 1. Configuration
API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

def clean_js_to_dict(filename):
    """
    Aggressively strips JS comments, exports, and syntax to isolate 
    the list or dictionary for Python processing.
    """
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Strip single-line comments //
    content = re.sub(r'//.*', '', content)
    
    # 2. Strip multi-line comments /* ... */
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    # 3. Find the first occurrence of '[' or '{' and the last ']' or '}'
    # This ignores 'export const NAME =' and trailing semicolons
    match = re.search(r'(\[.*\]|\{.*\})', content, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find a valid JSON/JS structure in {filename}")
    
    data_str = match.group(1).strip()

    # 4. Basic JS to Python conversion for ast.literal_eval
    # Handle unquoted keys (e.g., region: -> "region":)
    data_str = re.sub(r'(\w+)\s*:', r'"\1":', data_str)
    # Handle leading decimals (.55 -> 0.55)
    data_str = re.sub(r':\s*\.(\d+)', r': 0.\1', data_str)
    # Map JS constants to Python
    data_str = data_str.replace('null', 'None').replace('true', 'True').replace('false', 'False')
    
    # 5. Remove trailing commas before closing braces/brackets
    data_str = re.sub(r',\s*([\]\}])', r'\1', data_str)

    try:
        # ast.literal_eval is safer and more flexible than json.loads for JS objects
        return ast.literal_eval(data_str)
    except Exception as e:
        print(f"Error parsing {filename}: {e}")
        # Final desperate attempt: if it's strictly JSON formatted now, try json
        return json.loads(data_str)

def load_all_data():
    print("🧹 Cleaning and loading Austin datasets...")
    # Map the files based on your specific filenames
    regions_data = clean_js_to_dict('updated_regions.js')
    demographics = clean_js_to_dict('demographics.js')
    properties = clean_js_to_dict('propertyData.js')
    
    # socioeconomic.json is already standard JSON
    with open('socioeconomic.json', 'r', encoding='utf-8') as f:
        socio = json.load(f)
        
    return regions_data, demographics, properties, socio
        

def generate_yearly_data(region_name, data_context):
    """
    Sends a targeted prompt to Gemini for a specific region.
    """
    prompt = f"""
    You are a data scientist specializing in Austin urban development. 
    Analyze the following raw data for the region: "{region_name}".
    
    DATA CONTEXT:
    {json.dumps(data_context, indent=2)}
    
    TASK:
    Generate a complete yearly dataset from 1990 to 2023.
    1. HOME PRICES: Use the values in the data as anchors. Interpolate the years in between using the 'yoy' (Year-over-Year) growth rates provided or logical linear growth.
    2. DEMOGRAPHICS: Map the population and racial percentages to every year. Transition smoothly between census years (1990, 2000, 2010, 2020).
    3. STATUS: Identify the "Gentrification Stage" or "Displacement Risk" based on the DVI and socioeconomic metrics.

    OUTPUT:
    Return a JSON list of objects. Each object must have: 
    "year", "median_home_value", "total_population", "pct_white", "pct_black", "pct_hispanic", "displacement_risk".
    """
    
    try:
        response = model.generate_content(prompt)
        # Extract JSON from potential markdown markers
        clean_response = re.sub(r'```json|```', '', response.text).strip()
        return json.loads(clean_response)
    except Exception as e:
        print(f"Error processing {region_name}: {e}")
        return None

def main():
    regions, demos, props, socio = load_all_data()
    final_output = []

    # Iterate through each region defined in the GeoJSON
    for feature in regions['features']:
        name = feature['properties']['region_name']
        print(f"Investigating {name}...")

        # Filter all database info relevant to this region
        context = {
            "demographics": [d for d in demos if d.get('region') == name],
            "property_history": [p for p in props if p.get('region') == name],
            "socioeconomic": [s for s in socio if s.get('neighborhood') == name or s.get('region') == name]
        }

        region_history = generate_yearly_data(name, context)
        if region_history:
            final_output.append({
                "region": name,
                "history": region_history
            })

    # Save the consolidated investigation result
    with open('austin_full_investigation_1990_2023.json', 'w') as f:
        json.dump(final_output, f, indent=2)
    print("Investigation complete. File saved as 'austin_full_investigation_1990_2023.json'.")

if __name__ == "__main__":
    main()