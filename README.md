# Austin's Shifting Ground: A Cultural Displacement Map

This project is an interactive data visualization tool designed to document four decades of demographic, economic, and cultural change across 15 Austin neighborhoods from 1990 to 2025.

## Project Overview

As Austin continues to grow, many historically significant neighborhoods are experiencing rapid transformation. This map provides a data-driven look at how displacement and gentrification have reshaped the city’s landscape, focusing on the communities most impacted by these shifts.

## Key Features

* **Interactive Timeline**: An animated time slider that shows demographic shifts and development pressure year-by-year.
* **Displacement Velocity Index (DVI)**: A custom metric (0–100) that calculates the speed of neighborhood change based on home values, income, and population turnover.
* **Legacy Business Tracking**: A catalog of local landmarks—both still operating and those lost—to show the human impact of cultural displacement.
* **Regional Comparison**: A side-by-side tool to analyze how different parts of the city (such as the **East 11th Street Corridor** vs. **South Lamar**) are evolving in relation to one another.


## Tracked Neighborhoods

The map currently monitors 15 specific regions, including:

* **East 11th/12th Street Corridor** (African American Cultural Heritage District)
* **East Cesar Chavez / East 5th-7th** (Mexican-American Heritage Corridor)
* **Holly / Rainey Street**
* **Red River Cultural District**
* **Montopolis & Dove Springs**
* **South Congress (SoCo)**

## Data Sources & Methodology

The data in this project is synthesized from several official and community-sourced archives:

* **U.S. Census Bureau**: Decennial data (1990–2020) and American Community Survey (ACS) 5-year estimates.
* **Travis Central Appraisal District (TCAD)**: Historical property values and tax data.
* **City of Austin**: Official boundaries, heritage district plans, and infrastructure projects like Project Connect.
* **Community Inventories**: Local records of business closures and cultural landmarks.

## Built With

* **React**: For the interactive user interface.
* **Leaflet**: For geospatial mapping and overlays.
* **Recharts**: For dynamic demographic and economic charts.
* **D3.js**: For data math and color interpolation.

---

# Austin Shifting Ground - User Guide

This guide provides a detailed explanation of the metrics and interactive features found in the Austin Cultural Displacement Map. It is designed to help users interpret the four decades of data regarding neighborhood transformation and resident displacement in Austin.

---

## Understanding the Displacement Velocity Index (DVI)

The **Displacement Velocity Index (DVI)** is the core metric used in this project to quantify the speed and intensity of change within a specific neighborhood. It is calculated on a scale of **0 to 100**.

### DVI Categories

* **0–20: Stable**
Neighborhoods in this range show minimal demographic turnover and steady property value trends relative to the city average.
* **20–35: Early Pressure**
These areas are beginning to see accelerated home value appreciation and a shift in household income levels.
* **35–55: Active Displacement**
This indicates a high-intensity transition period characterized by significant loss of long-term residents and rapid demographic shifts.
* **55+: Historic Displacement**
This score reflects areas that have undergone a complete structural transformation, often resulting in the permanent loss of the original community character.

---

## Interactive Features and Overlays

The map allows you to layer different data points to see how infrastructure and policy decisions correlate with neighborhood change.

* **Time Slider**: Adjust the slider to view the state of Austin from 1990 through 2025. This allows for a visual "time-lapse" of how displacement moved from the central core into the Eastern Crescent.
* **Project Connect Overlay**: Toggle this to see planned transit lines. These lines often correlate with "Early Pressure" DVI scores in nearby neighborhoods.
* **Legacy Businesses**: This layer highlights cultural anchors.
* **Operating**: Businesses that have successfully navigated rising rents and demographic shifts.
* **Closed**: Businesses that were forced to shutter or relocate due to redevelopment or financial pressure.


* **Development Pressure**: Highlighting areas with the highest year-over-year increases in appraised property values.

---

## Data-Driven Advocacy

This map is intended to move beyond simple observation and serve as a tool for local engagement. For residents in Austin districts, the data presented can be used as a factual basis for discussions with local and state representatives regarding housing policy and neighborhood preservation.

### Using This Data for Local Engagement

* **Identify Trends**: Use the timeline to identify which neighborhoods are currently in the "Active Displacement" phase to prioritize community support.
* **Inform Representatives**: Provide specific DVI shifts and legacy business loss data when communicating with state and local officials about district-specific needs.
* **Support Local Activism**: This data can provide a baseline for groups involved in local Austin activism and community resistance efforts.

---

## Methodology Note

Data is synthesized from the **U.S. Census Bureau**, the **Travis Central Appraisal District**, and community-led business inventories. While demographic data is updated at decennial intervals, socioeconomic metrics are interpolated using American Community Survey (ACS) 5-year estimates to provide a continuous timeline.
