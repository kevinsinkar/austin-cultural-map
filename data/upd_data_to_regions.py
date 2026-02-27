import json
import google.generativeai as genai
import os

# --- CONFIGURATION ---
INPUT_FILE = "udp_austin.geojson"
OUTPUT_FILE = "updated_regions.js"

API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

def get_centroid(geometry):
    """Calculates a simple centroid to help Gemini identify the area."""
    coords = []
    if geometry['type'] == 'MultiPolygon':
        # Flattening MultiPolygon for a simple center point
        for polygon in geometry['coordinates']:
            for ring in polygon:
                coords.extend(ring)
    elif geometry['type'] == 'Polygon':
        for ring in geometry['coordinates']:
            coords.extend(ring)
    
    if not coords: return None
    lats = [c[1] for c in coords]
    lons = [c[0] for c in coords]
    return sum(lons) / len(lons), sum(lats) / len(lats)

def research_area_with_gemini(properties, centroid):
    """Asks Gemini to identify the neighborhood based on tract data and coordinates."""
    lon, lat = centroid
    tract = properties.get('name22', 'Unknown')
    description = properties.get('descriptio', '')
    
    prompt = f"""
    Act as an Austin, Texas local geography expert. 
    I have a geographic region with the following data:
    - Census Tract: {tract}
    - Coordinates: {lat}, {lon}
    - Data Description: {description}
    
    What is the specific neighborhood name or popular area name locals call this? 
    Examples: 'Bouldin Creek', 'Montopolis', 'Mueller', 'Crestview'.
    
    Return ONLY a JSON object with these keys:
    "region_name": (The full neighborhood name),
    "short_name": (A shorter version, e.g. 'E 11th' for 'East 11th Street'),
    "heritage": (A brief string about the area's culture or 'N/A')
    """
    
    try:
        response = model.generate_content(prompt)
        # Cleaning response to ensure strictly JSON
        text = response.text.replace('```json', '').replace('```', '').strip()
        return json.loads(text)
    except Exception as e:
        print(f"Error researching tract {tract}: {e}")
        return {"region_name": f"Tract {tract}", "short_name": tract, "heritage": "N/A"}

def main():
    with open(INPUT_FILE, 'r') as f:
        geojson_data = json.load(f)

    new_features = []
    
    for i, feature in enumerate(geojson_data['features']):
        props = feature['properties']
        geom = feature['geometry']
        
        # Check if neighborhood name already exists
        existing_name = props.get('neighborho')
        
        if existing_name and existing_name.strip():
            print(f"[{i}] Keeping existing name: {existing_name}")
            region_info = {
                "region_name": existing_name,
                "short_name": existing_name[:15],
                "heritage": "N/A"
            }
        else:
            centroid = get_centroid(geom)
            print(f"[{i}] Researching area near {centroid}...")
            region_info = research_area_with_gemini(props, centroid)
        
        # Format for regions.js
        new_feature = {
            "type": "Feature",
            "properties": {
                "region_id": i + 1,
                "region_name": region_info['region_name'],
                "short_name": region_info['short_name'],
                "heritage": region_info['heritage']
            },
            "geometry": geom
        }
        new_features.append(new_feature)

    # Wrap in the JS Export format
    final_output = {
        "type": "FeatureCollection",
        "features": new_features
    }
    
    js_content = f"export const REGIONS_GEOJSON = {json.dumps(final_output, indent=2)};"
    
    with open(OUTPUT_FILE, 'w') as f:
        f.write(js_content)
    
    print(f"Successfully created {OUTPUT_FILE}")

if __name__ == "__main__":
    main()