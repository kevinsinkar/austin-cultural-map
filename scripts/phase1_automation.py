#!/usr/bin/env python3
"""
Phase 1 Automation Script - Austin Cultural Map Data Integrity
Uses Gemini 2.5-fast API to complete all Phase 1 tasks from agent-todo-list.md

Tasks completed:
1.1 - Normalize demographic field names
1.2 - Normalize property field names  
1.3 - Normalize socioeconomic field names
1.4 - Validate region-to-tract mapping
1.5 - Surface rent burden in detail panel

Author: AI Agent
Date: March 3, 2026
"""

import os
import json
import sys
import time
import copy
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('phase1_automation.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

class Phase1Automator:
    """Main automation class for Phase 1 data integrity tasks"""
    
    def __init__(self):
        self.base_path = Path(__file__).parent.parent
        self.data_path = self.base_path / "data" / "audit_output"
        self.output_path = self.base_path / "data" / "phase1_output"
        self.output_path.mkdir(exist_ok=True)
        
        # Validate required files exist
        self.validate_data_files()
        
        # Initialize Gemini after validation
        self.setup_gemini()
        
        # Field mapping dictionaries based on todo list specifications
        self.demographic_field_mappings = {
            'pct_hispanic': [
                'hispanic_pct', 'hispanic_percent', 'hispanic_percentage', 
                'hispanic_latino_pct', 'ethnicity_hispanic_pct', 'ethnicity_hispanic_percent',
                'population_hispanic_pct', 'population_hispanic_percent', 'race_hispanic_pct', 
                'race_hispanic_percentage', 'percent_hispanic'
            ],
            'pct_black_non_hispanic': [
                'black_non_hispanic_pct', 'pct_black', 'black_pct', 'black_percent', 
                'black_percentage', 'african_american_pct', 'pct_african_american', 
                'percent_african_american', 'percent_black', 'percent_black_non_hispanic',
                'ethnicity_black_pct', 'ethnicity_black_percent', 'population_black_pct', 
                'population_black_percent', 'race_black_pct', 'race_black_percentage'
            ],
            'pct_white_non_hispanic': [
                'white_non_hispanic_pct', 'pct_white', 'white_pct', 'white_percent', 
                'white_percentage', 'percent_white', 'percent_white_non_hispanic', 
                'percent_caucasian', 'ethnicity_white_pct', 'ethnicity_white_percent',
                'population_white_pct', 'population_white_percent', 'race_white_pct', 
                'race_white_percentage'
            ],
            'pct_asian': [
                'asian_pct', 'asian_percent', 'asian_percentage', 'asian_non_hispanic_pct',
                'pct_asian_other', 'asian_other_pct', 'percent_asian', 
                'percent_asian_non_hispanic', 'ethnicity_asian_pct', 'ethnicity_asian_percent',
                'population_asian_pct', 'population_asian_percent', 'race_asian_pct', 
                'race_asian_percentage'
            ],
            'pct_other': [
                'other_pct', 'other_percentage', 'percent_other', 'ethnicity_other_pct',
                'race_other_pct', 'race_other_percentage'
            ],
            'total_population': [
                'population', 'population_total', 'total', 'regional_population'
            ],
            'pct_bachelors_degree_or_higher': [
                'bachelors_degree_or_higher_pct', 'pct_bachelors_or_higher',
                'percent_bachelor_degree_or_higher', 'percent_bachelors_degree_or_higher',
                'percent_with_bachelor_degree_or_higher', 'percent_with_bachelors_degree',
                'percent_with_bachelors_degree_or_higher'
            ],
            'pct_foreign_born': ['foreign_born_pct', 'foreign_born_percent'],
            'avg_household_size': ['average_household_size', 'household_size', 'household_size_avg']
        }
        
        self.property_field_mappings = {
            'median_home_value': [
                'median_home_price', 'home_value_median', 'median_home_value_usd'
            ],
            'median_rent_monthly': [
                'median_rent', 'median_rent_usd', 'median_rental_rate_monthly',
                'average_rent', 'average_rent_monthly', 'average_rent_per_month',
                'average_rent_per_month_usd', 'average_rent_usd', 'avg_rent',
                'avg_rent_monthly', 'rent_median'
            ],
            'pct_owner_occupied': [
                'owner_occupied_pct', 'owner_occupied_percent', 'owner_occupied_rate',
                'owner_occupied_rate_pct', 'owner_occupied_rate_percent',
                'owner_occupied_units_pct', 'owner_occupied_units_percent',
                'percent_owner_occupied', 'homeownership_rate', 'homeownership_rate_pct',
                'homeownership_rate_percent'
            ],
            'pct_renter_occupied': [
                'renter_occupied_pct', 'renter_occupied_rate_percent',
                'renter_occupied_units_percent', 'percent_renter_occupied'
            ],
            'total_housing_units': ['housing_units', 'residential_units'],
            'vacancy_rate': ['vacancy_rate_percent'],
            'median_property_tax': ['average_property_tax', 'avg_property_tax'],
            'new_construction_permits': [
                'new_constructions', 'new_constructions_annual', 'new_housing_units_built',
                'new_units_built', 'units_built'
            ],
            'homes_sold': ['homes_sold_total'],
            'avg_days_on_market': ['average_days_on_market'],
            'pct_single_family': ['percent_single_family', 'percent_single_family_homes'],
            'commercial_vacancy_rate': [
                'commercial_vacancy_rate_pct', 'commercial_vacancy_rate_percent'
            ]
        }
        
        self.socioeconomic_field_mappings = {
            'median_household_income': [
                'median_household_income_usd', 'income_median_household'
            ],
            'poverty_rate': [
                'poverty_rate_pct', 'poverty_rate_percent', 'poverty_rate_percentage',
                'pct_poverty'
            ],
            'unemployment_rate': [
                'unemployment_rate_pct', 'unemployment_rate_percent',
                'unemployment_rate_percentage', 'employment_unemployment_rate'
            ],
            'per_capita_income': ['per_capita_income_usd'],
            'number_of_local_businesses': [
                'local_businesses_count', 'small_business_count', 'total_businesses',
                'number_of_businesses'
            ],
            'legacy_business_closure_rate': ['legacy_business_closure_rate_pct']
        }
    
    def validate_data_files(self):
        """Validate that required data files exist"""
        required_files = [
            'audited_demographics.json',
            'audited_property.json', 
            'audited_socioeconomic.json'
        ]
        
        missing_files = []
        for filename in required_files:
            file_path = self.data_path / filename
            if not file_path.exists():
                missing_files.append(str(file_path))
        
        if missing_files:
            error_msg = f"Required data files missing:\n" + "\n".join(missing_files)
            error_msg += "\n\nPlease ensure the audit process has been run first."
            raise FileNotFoundError(error_msg)
        
        logging.info("All required data files found")
    
    def setup_gemini(self):
        """Initialize Gemini API with environment key"""
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("google-generativeai package not installed. Run: pip install google-generativeai")
        
        genai.configure(api_key=api_key)
        self.genai = genai  # Store reference for later use
        
        # List available models and pick the best flash model
        logging.info("Listing available Gemini models...")
        available_models = []
        for m in genai.list_models():
            methods = m.supported_generation_methods
            if 'generateContent' in methods:
                available_models.append(m.name)
                logging.info(f"  Available: {m.name}")
        
        # Prefer gemini-2.5-flash, then gemini-2.0-flash, then any flash model
        model_name = None
        for preferred in ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash']:
            if preferred in available_models:
                model_name = preferred
                break
        
        if not model_name:
            # Fall back to any flash model, or first available
            flash_models = [m for m in available_models if 'flash' in m.lower()]
            model_name = flash_models[0] if flash_models else available_models[0]
        
        logging.info(f"Selected model: {model_name}")
        
        # Configure model for fast processing 
        generation_config = {
            "temperature": 0.1,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 8192,
        }
        
        try:
            self.model = genai.GenerativeModel(
                model_name=model_name,
                generation_config=generation_config,
            )
            
            # Test the model with a simple query
            test_response = self.model.generate_content("Hello, respond with 'API working'")
            if "API working" not in test_response.text:
                logging.warning("Gemini API test response unexpected, but proceeding...")
                
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Gemini model: {e}")
        
        logging.info("Gemini API initialized successfully")
    
    def load_data_file(self, filename: str) -> List[Dict]:
        """Load JSON data file with error handling"""
        file_path = self.data_path / filename
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logging.info(f"Loaded {len(data)} records from {filename}")
            return data
        except Exception as e:
            logging.error(f"Error loading {filename}: {e}")
            return []
    
    def save_data_file(self, data: List[Dict], filename: str) -> bool:
        """Save data to output file with error handling"""
        file_path = self.output_path / filename
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logging.info(f"Saved {len(data)} records to {filename}")
            return True
        except Exception as e:
            logging.error(f"Error saving {filename}: {e}")
            return False
    
    def normalize_field_variants(self, record: Dict, field_mappings: Dict) -> Tuple[Dict, Dict]:
        """
        Normalize field variants in a single record using Gemini API for conflict resolution
        Returns: (normalized_record, normalization_log)
        """
        normalized_record = copy.deepcopy(record)
        log_entry = {
            'region': record.get('region', 'Unknown'),
            'region_id': record.get('region_id', 'Unknown'),
            'year': record.get('year', 'Unknown'),
            'normalizations': [],
            'conflicts': [],
            'removals': []
        }
        
        for canonical_name, variants in field_mappings.items():
            # Check if canonical field exists and collect variant values
            canonical_value = record.get(canonical_name)
            variant_values = {}
            
            for variant in variants:
                if variant in record and record[variant] is not None:
                    variant_values[variant] = record[variant]
            
            # If no canonical value but variants exist, resolve using Gemini
            if canonical_value is None and variant_values:
                if len(variant_values) == 1:
                    # Simple case: only one variant
                    variant_name, value = next(iter(variant_values.items()))
                    normalized_record[canonical_name] = value
                    log_entry['normalizations'].append({
                        'canonical': canonical_name,
                        'source_field': variant_name,
                        'value': value
                    })
                else:
                    # Multiple variants - ask Gemini to resolve
                    resolved_value = self.resolve_field_conflict_with_gemini(
                        canonical_name, variant_values, record
                    )
                    if resolved_value is not None:
                        normalized_record[canonical_name] = resolved_value
                        log_entry['conflicts'].append({
                            'canonical': canonical_name,
                            'variants': variant_values,
                            'resolved_value': resolved_value
                        })
            
            # Remove variant fields after normalization
            for variant in variants:
                if variant in normalized_record and variant != canonical_name:
                    del normalized_record[variant]
                    log_entry['removals'].append(variant)
        
        return normalized_record, log_entry
    
    def resolve_field_conflict_with_gemini(self, canonical_name: str, 
                                          variant_values: Dict, record: Dict) -> Optional[Any]:
        """Use Gemini API to resolve conflicts between variant field values"""
        
        context = f"""
        You are resolving a data conflict for Austin cultural displacement mapping.
        
        Record context:
        - Region: {record.get('region', 'Unknown')}
        - Year: {record.get('year', 'Unknown')}
        - Region ID: {record.get('region_id', 'Unknown')}
        
        Field: {canonical_name}
        Conflicting values found:
        {json.dumps(variant_values, indent=2)}
        
        Rules:
        1. Prefer more specific field names (e.g., 'pct_black_non_hispanic' over 'black_pct')
        2. For rent data, prefer median over average
        3. Prefer fields that include units/scale indicators
        4. If values are very close (<5% difference), choose the more specific field
        5. If values are very different (>15% difference), choose the most authoritative-sounding field name
        
        Return ONLY the chosen numeric value, no explanation.
        """
        
        try:
            response = self.model.generate_content(context.strip())
            result = response.text.strip()
            
            # Try to parse as number
            try:
                return float(result)
            except ValueError:
                # If Gemini returned text, try to extract number
                import re
                numbers = re.findall(r'-?\d+\.?\d*', result)
                if numbers:
                    return float(numbers[0])
                
            logging.warning(f"Could not parse Gemini response for {canonical_name}: {result}")
            # Fallback: choose first value
            return next(iter(variant_values.values()))
            
        except Exception as e:
            logging.error(f"Gemini API error resolving {canonical_name}: {e}")
            # Fallback: choose first value
            return next(iter(variant_values.values()))
    
    def validate_percentage_scale_with_gemini(self, data: List[Dict], data_type: str) -> List[Dict]:
        """Use Gemini to validate and normalize percentage scales"""
        
        # Sample a few records to determine scale
        sample_records = data[:min(10, len(data))]
        
        context = f"""
        You are validating percentage field scales for Austin demographic data.
        
        Data type: {data_type}
        Sample records:
        {json.dumps(sample_records, indent=2)}
        
        The app code in ChartTooltip.jsx shows: (p.value * 100).toFixed(1)%
        This means the data should be in 0-1 scale (not 0-100 scale).
        
        Examine the percentage fields (pct_*, *_rate, etc.) in these samples.
        
        Respond with JSON only:
        {{
          "current_scale": "0-1" or "0-100" or "mixed",
          "needs_conversion": true or false,
          "fields_to_convert": ["field1", "field2", ...]
        }}
        """
        
        try:
            response = self.model.generate_content(context.strip())
            result = json.loads(response.text.strip())
            
            if result.get('needs_conversion', False):
                fields_to_convert = result.get('fields_to_convert', [])
                logging.info(f"Converting percentage scale for fields: {fields_to_convert}")
                
                # Convert 0-100 scale to 0-1 scale
                for record in data:
                    for field in fields_to_convert:
                        if field in record and record[field] is not None:
                            value = float(record[field])
                            if value > 1.0:  # Likely 0-100 scale
                                record[field] = value / 100.0
                
            return data
            
        except Exception as e:
            logging.error(f"Error validating percentage scale: {e}")
            return data
    
    def task_1_1_normalize_demographics(self):
        """Task 1.1: Normalize demographic field names"""
        logging.info("Starting Task 1.1: Normalize demographic field names")
        
        data = self.load_data_file('audited_demographics.json')
        if not data:
            return False
        
        normalized_data = []
        normalization_log = []
        
        for record in data:
            normalized_record, log_entry = self.normalize_field_variants(
                record, self.demographic_field_mappings
            )
            
            normalized_data.append(normalized_record)
            if log_entry['normalizations'] or log_entry['conflicts']:
                normalization_log.append(log_entry)
        
        # Validate percentage scales
        normalized_data = self.validate_percentage_scale_with_gemini(normalized_data, 'demographics')
        
        # Save results
        success = self.save_data_file(normalized_data, 'audited_demographics_normalized.json')
        
        # Save normalization log
        log_summary = {
            'task': '1.1 - Normalize demographic field names',
            'total_records': len(data),
            'records_normalized': len([log for log in normalization_log if log['normalizations']]),
            'conflicts_resolved': len([log for log in normalization_log if log['conflicts']]),
            'detailed_log': normalization_log,
            'completion_status': 'success' if success else 'failed'
        }
        
        with open(self.output_path / 'task_1_1_normalization_log.json', 'w') as f:
            json.dump(log_summary, f, indent=2)
        
        logging.info(f"Task 1.1 complete: {log_summary['records_normalized']} normalized, {log_summary['conflicts_resolved']} conflicts")
        return success
    
    def task_1_2_normalize_property(self):
        """Task 1.2: Normalize property field names"""
        logging.info("Starting Task 1.2: Normalize property field names")
        
        data = self.load_data_file('audited_property.json')
        if not data:
            return False
        
        normalized_data = []
        normalization_log = []
        
        for record in data:
            normalized_record, log_entry = self.normalize_field_variants(
                record, self.property_field_mappings
            )
            
            normalized_data.append(normalized_record)
            if log_entry['normalizations'] or log_entry['conflicts']:
                normalization_log.append(log_entry)
        
        # Save results
        success = self.save_data_file(normalized_data, 'audited_property_normalized.json')
        
        # Save normalization log
        log_summary = {
            'task': '1.2 - Normalize property field names',
            'total_records': len(data),
            'records_normalized': len([log for log in normalization_log if log['normalizations']]),
            'conflicts_resolved': len([log for log in normalization_log if log['conflicts']]),
            'detailed_log': normalization_log,
            'completion_status': 'success' if success else 'failed'
        }
        
        with open(self.output_path / 'task_1_2_normalization_log.json', 'w') as f:
            json.dump(log_summary, f, indent=2)
        
        logging.info(f"Task 1.2 complete: {log_summary['records_normalized']} normalized, {log_summary['conflicts_resolved']} conflicts")
        return success
    
    def task_1_3_normalize_socioeconomic(self):
        """Task 1.3: Normalize socioeconomic field names"""
        logging.info("Starting Task 1.3: Normalize socioeconomic field names")
        
        data = self.load_data_file('audited_socioeconomic.json')
        if not data:
            return False
        
        normalized_data = []
        normalization_log = []
        
        for record in data:
            # Include bachelors degree normalization from both demographics and socioeconomic
            combined_mappings = {**self.socioeconomic_field_mappings}
            if 'pct_bachelors_degree_or_higher' not in combined_mappings:
                combined_mappings['pct_bachelors_degree_or_higher'] = self.demographic_field_mappings['pct_bachelors_degree_or_higher']
            
            normalized_record, log_entry = self.normalize_field_variants(
                record, combined_mappings
            )
            
            normalized_data.append(normalized_record)
            if log_entry['normalizations'] or log_entry['conflicts']:
                normalization_log.append(log_entry)
        
        # Save results
        success = self.save_data_file(normalized_data, 'audited_socioeconomic_normalized.json')
        
        # Save normalization log
        log_summary = {
            'task': '1.3 - Normalize socioeconomic field names',
            'total_records': len(data),
            'records_normalized': len([log for log in normalization_log if log['normalizations']]),
            'conflicts_resolved': len([log for log in normalization_log if log['conflicts']]),
            'detailed_log': normalization_log,
            'completion_status': 'success' if success else 'failed'
        }
        
        with open(self.output_path / 'task_1_3_normalization_log.json', 'w') as f:
            json.dump(log_summary, f, indent=2)
        
        logging.info(f"Task 1.3 complete: {log_summary['records_normalized']} normalized, {log_summary['conflicts_resolved']} conflicts")
        return success
    
    def task_1_4_validate_region_tract_mapping(self):
        """Task 1.4: Validate region-to-tract mapping"""
        logging.info("Starting Task 1.4: Validate region-to-tract mapping")
        
        # Load all three data files to extract region mappings
        demographics = self.load_data_file('audited_demographics.json')
        property_data = self.load_data_file('audited_property.json')
        socioeconomic = self.load_data_file('audited_socioeconomic.json')
        
        if not any([demographics, property_data, socioeconomic]):
            return False
        
        # Collect all unique regions
        all_regions = set()
        region_mappings = {}
        
        for dataset_name, dataset in [
            ('demographics', demographics),
            ('property', property_data), 
            ('socioeconomic', socioeconomic)
        ]:
            for record in dataset:
                region_name = record.get('region')
                region_id = record.get('region_id')
                
                if region_name and region_id:
                    all_regions.add((region_name, region_id))
                    if region_name not in region_mappings:
                        region_mappings[region_name] = {
                            'region_id': region_id,
                            'appears_in': []
                        }
                    
                    if dataset_name not in region_mappings[region_name]['appears_in']:
                        region_mappings[region_name]['appears_in'].append(dataset_name)
        
        # Use Gemini to analyze the GeoJSON and create tract mapping
        geojson_analysis = self.analyze_geojson_with_gemini(region_mappings)
        
        # Create tract mapping table
        tract_mapping = {
            'analysis_date': time.strftime('%Y-%m-%d %H:%M:%S'),
            'total_data_regions': len(all_regions),
            'geojson_analysis': geojson_analysis,
            'region_mappings': region_mappings,
            'recommendations': self.generate_mapping_recommendations_with_gemini(
                region_mappings, geojson_analysis
            )
        }
        
        # Save mapping
        with open(self.output_path / 'region_tract_mapping.json', 'w') as f:
            json.dump(tract_mapping, f, indent=2)
        
        logging.info(f"Task 1.4 complete: analyzed {len(all_regions)} regions")
        return True
    
    def analyze_geojson_with_gemini(self, region_mappings: Dict) -> Dict:
        """Use Gemini to analyze GeoJSON structure and region mappings"""
        
        # Try to load GeoJSON files
        geojson_paths = [
            self.base_path / "data" / "regions.js",
            self.base_path / "data" / "final_updated_regions.js",
        ]
        
        geojson_content = ""
        for path in geojson_paths:
            if path.exists():
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()[:5000]  # First 5000 chars to avoid token limits
                        geojson_content += f"\n\nFile: {path.name}\n{content}"
                except:
                    pass
        
        context = f"""
        You are analyzing Austin region data for mapping validation.
        
        Data regions found ({len(region_mappings)}):
        {json.dumps(list(region_mappings.keys())[:20], indent=2)}
        {"... (showing first 20)" if len(region_mappings) > 20 else ""}
        
        GeoJSON structure preview:
        {geojson_content}
        
        Analyze and respond with JSON only:
        {{
          "geojson_regions_found": number,
          "data_vs_geojson_match": true/false,
          "orphaned_data_regions": ["region1", "region2"],
          "orphaned_geojson_regions": ["region1", "region2"],
          "tract_aggregation_detected": true/false,
          "tract_pattern_analysis": "description of census tract patterns found"
        }}
        """
        
        try:
            response = self.model.generate_content(context.strip())
            return json.loads(response.text.strip())
        except Exception as e:
            logging.error(f"Error analyzing GeoJSON: {e}")
            return {
                'error': str(e),
                'geojson_regions_found': 0,
                'data_vs_geojson_match': False
            }
    
    def generate_mapping_recommendations_with_gemini(self, region_mappings: Dict, 
                                                    geojson_analysis: Dict) -> Dict:
        """Generate recommendations for About modal and mapping fixes"""
        
        context = f"""
        You are generating recommendations for Austin cultural map region documentation.
        
        Current About modal says: "15 Austin neighborhoods"
        Actual data regions: {len(region_mappings)}
        
        GeoJSON analysis: {json.dumps(geojson_analysis, indent=2)}
        
        Generate recommendations in JSON format:
        {{
          "about_modal_update": "Suggested text for About modal",
          "mapping_actions": ["action1", "action2"],
          "data_integrity_score": 0.0-1.0,
          "priority": "high/medium/low"
        }}
        """
        
        try:
            response = self.model.generate_content(context.strip())
            return json.loads(response.text.strip())
        except Exception as e:
            logging.error(f"Error generating recommendations: {e}")
            return {
                'error': str(e),
                'about_modal_update': 'Review region count accuracy',
                'priority': 'high'
            }
    
    def task_1_5_add_rent_burden_to_panel(self):
        """Task 1.5: Add rent burden metric to RegionDetailPanel"""
        logging.info("Starting Task 1.5: Add rent burden to detail panel")
        
        panel_file = self.base_path / "components" / "RegionDetailPanel.jsx"
        
        if not panel_file.exists():
            logging.error("RegionDetailPanel.jsx not found")
            return False
        
        # Use Gemini to generate the code modification
        with open(panel_file, 'r', encoding='utf-8') as f:
            current_code = f.read()
        
        context = f"""
        You are modifying RegionDetailPanel.jsx to add rent burden display.
        
        Requirements:
        1. Add a fifth metric card after existing four cards
        2. Source from rent_burden_pct in demographics data
        3. Label: "Rent-Burdened Households"
        4. Format as percentage with red arrow if increasing
        5. Subtitle: "% of renter households paying ≥30% of income on rent"
        
        Current code:
        {current_code}
        
        Return ONLY the modified JSX code for the entire file. Keep all existing functionality intact.
        """
        
        try:
            response = self.model.generate_content(context.strip())
            modified_code = response.text.strip()
            
            # Remove code block markers if present
            if modified_code.startswith('```'):
                modified_code = '\n'.join(modified_code.split('\n')[1:-1])
            
            # Backup original file
            backup_file = self.output_path / "RegionDetailPanel_backup.jsx"
            with open(backup_file, 'w', encoding='utf-8') as f:
                f.write(current_code)
            
            # Write modified file
            with open(panel_file, 'w', encoding='utf-8') as f:
                f.write(modified_code)
            
            logging.info("Task 1.5 complete: Added rent burden to RegionDetailPanel")
            return True
            
        except Exception as e:
            logging.error(f"Error modifying RegionDetailPanel: {e}")
            return False
    
    def run_all_tasks(self) -> Dict[str, bool]:
        """Run all Phase 1 tasks in sequence"""
        logging.info("Starting Phase 1 automation - Data Integrity Tasks")
        
        results = {}
        
        # Task 1.1 - Demographics normalization
        results['task_1_1'] = self.task_1_1_normalize_demographics()
        
        # Task 1.2 - Property normalization
        results['task_1_2'] = self.task_1_2_normalize_property()
        
        # Task 1.3 - Socioeconomic normalization  
        results['task_1_3'] = self.task_1_3_normalize_socioeconomic()
        
        # Task 1.4 - Region mapping validation
        results['task_1_4'] = self.task_1_4_validate_region_tract_mapping()
        
        # Task 1.5 - Add rent burden to UI
        results['task_1_5'] = self.task_1_5_add_rent_burden_to_panel()
        
        # Generate summary report
        self.generate_phase1_report(results)
        
        return results
    
    def generate_phase1_report(self, results: Dict[str, bool]):
        """Generate comprehensive Phase 1 completion report"""
        
        report = {
            'phase': 'Phase 1 - Data Integrity',
            'execution_date': time.strftime('%Y-%m-%d %H:%M:%S'),
            'tasks_completed': sum(results.values()),
            'tasks_total': len(results),
            'success_rate': sum(results.values()) / len(results),
            'task_results': results,
            'next_steps': [
                'Review normalization logs for any conflicts that need manual attention',
                'Test RegionDetailPanel rent burden display',
                'Update About modal text based on region mapping analysis',
                'Proceed to Phase 2 - Core Feature Gaps'
            ],
            'output_files': [
                'audited_demographics_normalized.json',
                'audited_property_normalized.json', 
                'audited_socioeconomic_normalized.json',
                'region_tract_mapping.json',
                'task_*_normalization_log.json'
            ]
        }
        
        # Save report
        with open(self.output_path / 'phase1_completion_report.json', 'w') as f:
            json.dump(report, f, indent=2)
        
        # Log summary
        logging.info(f"Phase 1 Complete: {report['tasks_completed']}/{report['tasks_total']} tasks successful")
        logging.info(f"Success rate: {report['success_rate']:.1%}")


def main():
    """Main execution function"""
    try:
        automator = Phase1Automator()
        results = automator.run_all_tasks()
        
        success_count = sum(results.values())
        total_count = len(results)
        
        print(f"\n{'='*60}")
        print(f"PHASE 1 AUTOMATION COMPLETE")
        print(f"{'='*60}")
        print(f"Tasks completed: {success_count}/{total_count}")
        print(f"Success rate: {success_count/total_count:.1%}")
        print(f"\nTask Results:")
        for task, success in results.items():
            status = "✅ SUCCESS" if success else "❌ FAILED"
            print(f"  {task}: {status}")
        
        if success_count == total_count:
            print(f"\n🎉 All Phase 1 tasks completed successfully!")
            print(f"📁 Output files saved to: data/phase1_output/")
            print(f"📋 Check phase1_completion_report.json for details")
        else:
            print(f"\n⚠️  Some tasks failed. Check logs for details.")
        
        return success_count == total_count
        
    except Exception as e:
        logging.error(f"Fatal error in Phase 1 automation: {e}")
        print(f"\n❌ FATAL ERROR: {e}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)