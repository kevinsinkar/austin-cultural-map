# -*- coding: utf-8 -*-
"""
fetch_council_districts.py
──────────────────────────
Downloads Austin's 10-1 council district boundaries from the City of
Austin ArcGIS feature service (BOUNDARIES_single_member_districts),
simplifies the geometry for web display, and writes
data/council_districts.json.

Usage: python scripts/fetch_council_districts.py
"""
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "council_districts.json"

URL = ("https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/"
       "BOUNDARIES_single_member_districts/FeatureServer/0/query"
       "?where=1%3D1&outFields=*&f=geojson&outSR=4326")


def thin_ring(ring, tolerance=0.0004):
    """Round to 4 decimals (~11 m) and drop points closer than `tolerance`
    degrees to the previously kept point. Keeps first/last intact."""
    out = [ring[0]]
    for pt in ring[1:-1]:
        last = out[-1]
        if math.hypot(pt[0] - last[0], pt[1] - last[1]) >= tolerance:
            out.append(pt)
    out.append(ring[-1])
    return [[round(x, 4), round(y, 4)] for x, y in out]


def simplify(geom):
    if geom["type"] == "Polygon":
        geom["coordinates"] = [thin_ring(r) for r in geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        geom["coordinates"] = [[thin_ring(r) for r in poly] for poly in geom["coordinates"]]
    return geom


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "austin-cultural-map/1.0"})
    gj = json.load(urllib.request.urlopen(req, timeout=60))
    feats = gj.get("features", [])
    print("features:", len(feats))
    if feats:
        print("sample properties:", {k: v for k, v in list(feats[0]["properties"].items())[:8]})
    out_feats = []
    for f in feats:
        props = f["properties"]
        # district number field name varies by vintage; probe common ones
        num = None
        for key in ("COUNCIL_DISTRICT", "council_district", "DISTRICT_NUMBER",
                    "district_number", "DISTRICT", "district", "SINGLE_MEMBER_DISTRICT"):
            if key in props and props[key] is not None:
                num = int(props[key])
                break
        out_feats.append({
            "type": "Feature",
            "properties": {"district": num},
            "geometry": simplify(f["geometry"]),
        })
    out_feats.sort(key=lambda f: f["properties"]["district"] or 0)
    result = {"type": "FeatureCollection", "features": out_feats}
    OUT.write_text(json.dumps(result), encoding="utf-8")
    print("districts:", [f["properties"]["district"] for f in out_feats])
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
