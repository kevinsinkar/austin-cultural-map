import json                                               
permits = json.load(open('permits_by_region_year.json'))          
prop = json.load(open('audited_property_normalized.json'))
for row in prop:                                          
    key = f"{row['region_id']}_{row['year']}"           
    p = permits.get(key)                                    
    if p:                                                   
        row['new_construction_permits'] = p['new_construction_permits']
        row['commercial_sqft'] = p['commercial_sqft']         
json.dump(prop, open('patched.json','w'), indent=2)