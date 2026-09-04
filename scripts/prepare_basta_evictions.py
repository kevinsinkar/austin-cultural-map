#!/usr/bin/env python3
"""
prepare_basta_evictions.py
──────────────────────────
Transforms BASTA's eviction filing counts (data/BASTA/) into eviction filing
RATES (filings per 100 renter households per year) keyed by tract GEOID, for
merging into audited_socioeconomic_normalized.json via
merge_permits_and_evictions.py --tract-level.

Method:
- Filings per (tract, year) = sum of all five case-outcome columns.
  BASTA uses 2020 census tracts for all years — matches our rosetta geoid22.
- Renter households per (region, snap year) estimated from our own census
  data: total_housing_units × (1 − vacancy_rate%) × (1 − pct_owner_occupied%).
- Filing counts are averaged over windows aligned to the ACS 5-year spans
  the socio rows represent, intersected with BASTA coverage (2014–2025):
      2015 row (ACS 2011–2015) ← mean of 2014–2015
      2020 row (ACS 2016–2020) ← mean of 2016–2020  (includes 2020 COVID
                                  moratorium months — rates are diluted)
      2023 row (ACS 2019–2023) ← mean of 2019–2023
- rate = mean annual filings / renter households × 100.
  Tracts with < 30 estimated renter households get null (rate unstable).

Output: data/audit_output/basta_eviction_rates.csv  (geoid, year, eviction_filing_rate)

Then run:
  python scripts/merge_permits_and_evictions.py \
    --evictions data/audit_output/basta_eviction_rates.csv --tract-level \
    --socio data/phase1_output/audited_socioeconomic_normalized.json [--in-place]
"""

import csv
import json
import os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASTA_CSV = os.path.join(BASE, "data", "BASTA", "2014-2025_geography_table_2026-06-02.csv")
ROSETTA = os.path.join(BASE, "data", "region_tract_rosetta.json")
DEMO_JSON = os.path.join(BASE, "data", "phase1_output", "audited_demographics_normalized.json")
PROP_JSON = os.path.join(BASE, "data", "phase1_output", "audited_property_normalized.json")
OUT_CSV = os.path.join(BASE, "data", "audit_output", "basta_eviction_rates.csv")

OUTCOME_COLS = [
    "Default judgment", "Dismissed", "Ruling for defendant",
    "Ruling for plaintiff", "Unclear or Other Case Outcome",
]

# socio snap year → BASTA filing-year window (ACS-aligned ∩ BASTA coverage)
WINDOWS = {
    2015: (2014, 2015),
    2020: (2016, 2020),
    2023: (2019, 2023),
}

MIN_RENTER_HH = 30


def closest_row(rows, year):
    if not rows:
        return None
    return min(rows, key=lambda r: abs(r["year"] - year))


def main():
    # ── Filings per (geoid, year) ──
    filings = defaultdict(int)
    with open(BASTA_CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            tract = (row.get("Census Tract") or "").strip()
            if not tract or tract == "NO GEOGRAPHY":
                continue
            geoid = "".join(c for c in tract if c.isdigit())
            if len(geoid) != 11:
                continue
            total = sum(int(row.get(k) or 0) for k in OUTCOME_COLS)
            filings[(geoid, int(row["Year"]))] += total
    print(f"Loaded {sum(filings.values()):,} geocoded filings "
          f"across {len(set(g for g, y in filings))} tracts")

    # ── region_id ↔ geoid ──
    with open(ROSETTA, encoding="utf-8") as f:
        rosetta = json.load(f)
    geoid_by_rid = {r["region_id"]: r["geoid22"] for r in rosetta}
    rid_by_geoid = {r["geoid22"]: r["region_id"] for r in rosetta}

    # ── Renter households per (region, snap year) from our census data ──
    with open(DEMO_JSON, encoding="utf-8") as f:
        demo_by_rid = defaultdict(list)
        for r in json.load(f):
            demo_by_rid[r["region_id"]].append(r)
    with open(PROP_JSON, encoding="utf-8") as f:
        prop_by_rid = defaultdict(list)
        for r in json.load(f):
            prop_by_rid[r["region_id"]].append(r)

    def renter_households(rid, snap):
        p = closest_row(prop_by_rid.get(rid), snap)
        d = closest_row(demo_by_rid.get(rid), snap)
        units = p.get("total_housing_units") if p else None
        vac = p.get("vacancy_rate") if p else None
        own = d.get("pct_owner_occupied") if d else None
        if units is None or own is None:
            return None
        occupied = units * (1 - (vac or 0) / 100)
        return occupied * (1 - own / 100)

    # ── Compute rates ──
    rows_out = []
    skipped_small = 0
    skipped_no_denominator = 0
    for rid, geoid in sorted(geoid_by_rid.items()):
        for snap, (y0, y1) in WINDOWS.items():
            yearly = [filings.get((geoid, y), 0) for y in range(y0, y1 + 1)]
            # Only emit if BASTA actually covers this tract at all
            if not any(filings.get((geoid, y)) is not None and (geoid, y) in filings
                       for y in range(y0, y1 + 1)):
                continue
            mean_filings = sum(yearly) / len(yearly)
            renters = renter_households(rid, snap)
            if renters is None:
                skipped_no_denominator += 1
                continue
            if renters < MIN_RENTER_HH:
                skipped_small += 1
                continue
            rate = round(mean_filings / renters * 100, 2)
            rows_out.append({"geoid": geoid, "year": snap, "eviction_filing_rate": rate})

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["geoid", "year", "eviction_filing_rate"])
        w.writeheader()
        w.writerows(rows_out)

    rates = [r["eviction_filing_rate"] for r in rows_out]
    rates.sort()
    print(f"\nWrote {len(rows_out)} (tract, year) rates to {OUT_CSV}")
    print(f"  Skipped — renter households < {MIN_RENTER_HH}: {skipped_small}")
    print(f"  Skipped — no denominator data: {skipped_no_denominator}")
    if rates:
        mid = rates[len(rates) // 2]
        p95 = rates[int(len(rates) * 0.95)]
        print(f"  Rate distribution: median {mid}, p95 {p95}, max {rates[-1]} "
              f"(filings per 100 renter households per year)")
        high = [r for r in rows_out if r["eviction_filing_rate"] > 25]
        if high:
            print(f"  Outliers > 25/100: {len(high)}")
            for r in sorted(high, key=lambda x: -x['eviction_filing_rate'])[:8]:
                rid = rid_by_geoid[r['geoid']]
                print(f"    region {rid} geoid {r['geoid']} {r['year']}: {r['eviction_filing_rate']}")


if __name__ == "__main__":
    main()
