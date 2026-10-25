# -*- coding: utf-8 -*-
"""
parse_tabling_db.py
───────────────────
Parses preservation_austin_tabling_database.md (the Claude-research tabling
database) into data/outreach_events.json for the Outreach layer/view.

Usage:  python scripts/parse_tabling_db.py            # parse only
        python scripts/parse_tabling_db.py --geocode  # parse + geocode via
                                                      # Nominatim (cached in
                                                      # scripts/geocode_cache.json)

The markdown is the source of truth; re-run this script whenever the
database file is updated. Manual coordinate overrides live in
scripts/geocode_overrides.json and always win over Nominatim results.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "preservation_austin_tabling_database.md"
OUT = ROOT / "data" / "outreach_events.json"
CACHE = Path(__file__).resolve().parent / "geocode_cache.json"
OVERRIDES = Path(__file__).resolve().parent / "geocode_overrides.json"

AUSTIN_BBOX = (30.02, -98.10, 30.60, -97.40)  # lat_min, lng_min, lat_max, lng_max

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# ── Section definitions: (section header regex, kind, column mapping) ──
# Column mapping: field name → column index (after splitting the row).
SECTIONS = [
    (r"^## 1\. Chronological table of dated events", "dated", 1,
     {"num": 0, "date": 1, "name": 2, "venue": 3, "cost": 4, "audience": 5,
      "tabling": 6, "confidence": 7, "fit": 8, "notes": 9}),
    (r"^## 2\. Recurring weekly and monthly series", "recurring", 1,
     {"num": 0, "name": 1, "date": 2, "venue": 3, "tabling": 4, "confidence": 5, "fit": 6}),
    (r"^## 3\. Listening opportunities", "listening", 1,
     {"name": 0, "date": 1, "date2": 2, "venue": 3, "notes": 4}),
    (r"^## 2\.1 Chronological table of new dated events", "dated", 2,
     {"num": 0, "date": 1, "name": 2, "venue": 3, "cost": 4, "audience": 5,
      "tabling": 6, "confidence": 7, "fit": 8, "notes": 9}),
    (r"^### 2\.1a Recurring events found without a confirmable", "tracking", 2,
     {"num": 0, "name": 1, "date": 2, "venue": 3, "tabling": 4, "fit": 5, "notes": 6}),
    (r"^## 2\.2 New recurring weekly, monthly and seasonal series", "recurring", 2,
     {"num": 0, "name": 1, "date": 2, "venue": 3, "cost": 4, "tabling": 5,
      "confidence": 6, "fit": 7, "notes": 8}),
    (r"^## 2\.3 New listening opportunities", "listening", 2,
     {"num": 0, "name": 1, "date": 2, "date2": 3, "venue": 4, "contact": 5,
      "fit": 6, "notes": 7}),
]


def clean(s):
    """Strip markdown bold/italics and collapse whitespace."""
    s = s.replace("**", "").replace("*", "")
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip()


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_status(tabling, kind):
    if kind == "listening":
        return "LISTEN"
    t = tabling or ""
    for kw in ["LISTEN", "OPEN", "NPO", "PART", "CLOSED", "VEND"]:
        if re.search(r"\b" + kw + r"\b", t):
            return kw
    return "UNK"


def parse_fit(fit_text):
    t = (fit_text or "").lower()
    has_high = "high" in t
    has_med = "med" in t
    has_low = "low" in t
    if has_high and has_low:
        return "Medium"
    if has_high:
        return "High"       # includes Med–High
    if has_med:
        return "Medium"     # includes Low–Med
    if has_low:
        return "Low"
    return None


def parse_confidence(conf_text):
    t = clean(conf_text or "")
    m = re.match(r"^(C|P|U)\b", t)
    return m.group(1) if m else None


WINDOW_START = "2026-10-01"  # database window opens Oct 2026

MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"


def _pick(candidates):
    """Earliest candidate inside the window; else the latest known one."""
    if not candidates:
        return None
    future = [c for c in candidates if c[0] >= WINDOW_START]
    return min(future) if future else max(candidates)


def parse_dates(date_text):
    """Return (startDate ISO, endDate ISO, approx bool).

    Collects every candidate date in the cell — ISO, "Nov 8 2026",
    "Late Apr 2027", "Spring 2027" — and prefers the earliest one on or
    after the database window start, so historical pattern references
    ("last ran Nov 8 2025") don't shadow the next occurrence.
    """
    t = clean(date_text or "")
    low = t.lower()
    candidates = []  # (iso, approx)

    iso = re.findall(r"\b(20\d\d)-(\d\d)-(\d\d)\b", t)
    for y, m, d in iso:
        candidates.append((f"{y}-{m}-{d}", False))

    # Textual "Nov 8 2026" / "Nov 8, 2026"
    for mon, day, year in re.findall(MONTH_RE + r"\.? (\d{1,2}),? (20\d\d)\b", low):
        mnum = MONTHS[mon[:3]]
        candidates.append((f"{year}-{mnum:02d}-{int(day):02d}", True))

    # "Early/Mid/Late Apr 2027" or bare "Apr 2027" (no day)
    for prefix, mon, year in re.findall(r"\b(early|mid|late)?[- ]?" + MONTH_RE + r"\.? (20\d\d)\b", low):
        mnum = MONTHS[mon[:3]]
        day = {"early": 5, "late": 25}.get(prefix, 15)
        candidates.append((f"{year}-{mnum:02d}-{day:02d}", True))

    # Seasons
    for season, mnum in [("spring", 4), ("summer", 7), ("fall", 10), ("autumn", 10), ("winter", 1)]:
        for year in re.findall(season + r" (20\d\d)\b", low):
            candidates.append((f"{year}-{mnum:02d}-15", True))

    pick = _pick(candidates)
    if not pick:
        return None, None, False
    start, approx = pick

    # Range end: second ISO date starting from the picked one, or a partial
    # "to 11-02" continuation.
    end = None
    if not approx and iso:
        later = sorted("-".join(x) for x in iso)
        later = [x for x in later if x > start]
        rest = t[t.find(start) + len(start):]
        m = re.match(r"\s*(?:to|–|-)\s*(\d\d)-(\d\d)\b", rest)
        if m:
            end = f"{start[:4]}-{m.group(1)}-{m.group(2)}"
        elif later and later[0] <= start[:8] + "28":
            # a nearby ISO date (same month-ish) reads as a range end
            if later[0][:7] == start[:7]:
                end = later[0]
    return start, end, approx


def parse_contacts(*texts):
    out = []
    joined = " ".join(clean(x) for x in texts if x)
    for email in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", joined):
        email = email.rstrip(".")
        if email not in out:
            out.append(email)
    for phone in re.findall(r"\(?\b\d{3}\)?[ -]\d{3}-\d{4}\b", joined):
        phone = phone.strip()
        if phone not in out:
            out.append(phone)
    return out


BUSINESS_RE = re.compile(
    r"chamber|business (assoc|district|expo|coalition)|downtown austin alliance|"
    r"\baiba\b|merchants|young chamber|business month|realtors", re.I)
POLITICAL_RE = re.compile(
    r"commission|city council|council member|town hall|budget|"
    r"neighborhood ass(ociatio)?n|contact team|\bna general\b|\bna meeting\b|"
    r"membership meeting|board meeting|civic", re.I)


def parse_arena(kind, status, *texts):
    """Strategic-plan advocacy arena: community / political / business.
    Listening bodies and civic meetings are the political arena; chambers
    and business districts the business arena; everything else community."""
    if kind == "listening" or status == "LISTEN":
        return "political"
    joined = " ".join(clean(x) for x in texts if x)
    if BUSINESS_RE.search(joined):
        return "business"
    if POLITICAL_RE.search(joined):
        return "political"
    return "community"


def parse_district(venue_text):
    m = re.findall(r"\bD(\d{1,2})\b", venue_text or "")
    return [f"D{d}" for d in dict.fromkeys(m)] or []


def parse_deadline(*texts):
    """Pull an explicit application/registration deadline date if present."""
    joined = " ".join(clean(x) for x in texts if x)
    pats = [
        r"(?:deadline|due|register(?:ed|ation)?(?: ends?| ended| by)?|applications? (?:due|close[ds]?|were due|ran [^;]* ?–?)|confirmed by)\s*:?\s*((?:20\d\d-\d\d-\d\d)|(?:[A-Z][a-z]{2,8}\.? \d{1,2},? 20\d\d)|(?:[A-Z][a-z]{2,8}\.? \d{1,2})|(?:\d{1,2}/\d{1,2}))",
    ]
    for p in pats:
        m = re.search(p, joined, re.I)
        if m:
            return m.group(1)
    return None


ADDR_RE = re.compile(
    r"\b(\d{2,5}(?:[ ]\d/\d)?[ ](?:[NSEW]\.?[ ])?[A-Za-z0-9\.'’\- ]{2,45}?"
    r"(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Parkway|Pkwy|"
    r"Highway|Hwy|Trail|Court|Ct|Cove|Cv|Place|Pl|Way|Point|Pt|Congress|Lamar|Gabriel|Jacinto)"
    r"\.?)(?:[ ,;]|$)")
ZIP_RE = re.compile(r"\b(787\d\d)\b")


def parse_address(venue_text):
    t = clean(venue_text or "")
    m = ADDR_RE.search(t)
    z = ZIP_RE.search(t)
    if m:
        addr = m.group(1).strip().rstrip(".,;")
        return addr + (f" {z.group(1)}" if z else "")
    return None


GENERIC_VENUE = re.compile(
    r"^(—|-|–|tbd\b|citywide|various|rotating|unknown|downtown\b|d\d+([ /]*d\d+)*$)", re.I)


def venue_name(venue_text):
    t = clean(venue_text or "")
    t = re.sub(r"\(.*?\)", "", t)
    first = re.split(r"[;]", t)[0]
    first = re.split(r",", first)[0].strip()
    if not first or len(first) < 4 or GENERIC_VENUE.match(first):
        return None
    return first


def parse_file():
    lines = SRC.read_text(encoding="utf-8").split("\n")
    events = []
    synth_id = 9000  # for rows without a numeric id (Part-1 listening table)
    i = 0
    section = None  # (kind, pass, colmap)
    while i < len(lines):
        line = lines[i]
        matched = False
        for pat, kind, pass_, colmap in SECTIONS:
            if re.match(pat, line):
                section = (kind, pass_, colmap)
                matched = True
                break
        if matched:
            i += 1
            continue
        if line.startswith("## ") or line.startswith("# "):
            # any other section header ends table scope
            if not any(re.match(p, line) for p, *_ in SECTIONS):
                section = None
        if section and line.strip().startswith("|"):
            kind, pass_, colmap = section
            cols = split_row(line)
            # skip header + separator rows
            if re.match(r"^[-: ]+$", cols[0]) or cols[0] in ("#", "Body"):
                i += 1
                continue
            if len(cols) < len(colmap):
                i += 1
                continue
            get = lambda k: cols[colmap[k]] if k in colmap and colmap[k] < len(cols) else ""
            raw_num = clean(get("num"))
            if "num" in colmap:
                m = re.match(r"^(\d+)$", raw_num)
                if not m:
                    i += 1
                    continue
                num = int(m.group(1))
            else:
                synth_id += 1
                num = synth_id
            name_raw = clean(get("name"))
            # "Event / Organizer" split — keep full string as name, split organizer
            parts = re.split(r" / ", name_raw, maxsplit=1)
            date_text = clean(get("date")) + (
                (" · " + clean(get("date2"))) if clean(get("date2")) else "")
            # Parse pattern + next-dates columns together so a confirmed
            # upcoming date beats a historical pattern reference.
            start, end, approx = parse_dates(
                clean(get("date")) + " ; " + clean(get("date2")))
            venue_raw = get("venue")
            tabling = clean(get("tabling")) or (clean(get("contact")) if "contact" in colmap else "")
            notes = clean(get("notes"))
            fit = parse_fit(get("fit") or notes if kind == "listening" else get("fit"))
            status = parse_status(tabling, kind)
            ev = {
                "id": num,
                "pass": pass_,
                "kind": kind,
                "name": clean(parts[0]),
                "organizer": clean(parts[1]) if len(parts) > 1 else None,
                "dateText": date_text,
                "startDate": start,
                "endDate": end,
                "approxDate": approx,
                "venueText": clean(venue_raw),
                "address": parse_address(venue_raw),
                "venueName": venue_name(venue_raw),
                "districts": parse_district(venue_raw),
                "cost": clean(get("cost")) or None,
                "audience": clean(get("audience")) or None,
                "tablingText": tabling or None,
                "status": status,
                "arena": parse_arena(kind, status, name_raw, get("audience"), notes),
                "confidence": parse_confidence(get("confidence")),
                "fit": fit,
                "sourceText": clean(get("confidence")) or None,
                "notes": notes or None,
                "contacts": parse_contacts(get("tabling"), get("contact") if "contact" in colmap else "", notes),
                "deadlineText": parse_deadline(get("tabling"), notes),
            }
            events.append(ev)
        i += 1
    return events


# ── Geocoding ──

def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def in_bbox(lat, lng):
    return AUSTIN_BBOX[0] <= lat <= AUSTIN_BBOX[2] and AUSTIN_BBOX[1] <= lng <= AUSTIN_BBOX[3]


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = ("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="
           + urllib.parse.quote(query))
    req = urllib.request.Request(url, headers={
        "User-Agent": "austin-cultural-map-outreach/1.0 (kevin.sinkar@gmail.com)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.load(r)
    except Exception as e:
        print(f"  ! geocode error for {query!r}: {e}")
        cache[query] = None
        return None
    time.sleep(1.1)
    if res:
        lat, lng = float(res[0]["lat"]), float(res[0]["lon"])
        hit = {"lat": round(lat, 6), "lng": round(lng, 6), "match": res[0].get("display_name", "")[:90]}
        cache[query] = hit if in_bbox(lat, lng) else None
        return cache[query]
    cache[query] = None
    return None


def geocode(events):
    cache = load_json(CACHE, {})
    overrides = load_json(OVERRIDES, {})
    done = 0
    for ev in events:
        key = ev["address"] or ev["venueName"]
        if not key:
            continue
        if key in overrides:
            ev["lat"], ev["lng"] = overrides[key]["lat"], overrides[key]["lng"]
            ev["geo"] = "override"
            continue
        query = (ev["address"] + ", Austin, TX") if ev["address"] else (ev["venueName"] + ", Austin, TX")
        hit = nominatim(query, cache)
        if hit is None and ev["address"] and ev["venueName"]:
            hit = nominatim(ev["venueName"] + ", Austin, TX", cache)
        if hit:
            ev["lat"], ev["lng"] = hit["lat"], hit["lng"]
            ev["geo"] = "address" if ev["address"] else "venue"
            done += 1
        if done % 25 == 0 and done:
            CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    return events


def main():
    events = parse_file()
    print(f"Parsed {len(events)} entries")
    from collections import Counter
    print("  kinds:", dict(Counter(e['kind'] for e in events)))
    print("  status:", dict(Counter(e['status'] for e in events)))
    print("  arena:", dict(Counter(e['arena'] for e in events)))
    print("  fit:", dict(Counter(str(e['fit']) for e in events)))
    print("  with ISO date:", sum(1 for e in events if e['startDate'] and not e['approxDate']))
    print("  with approx date:", sum(1 for e in events if e['approxDate']))
    print("  with address:", sum(1 for e in events if e['address']))
    print("  with contacts:", sum(1 for e in events if e['contacts']))
    if "--geocode" in sys.argv:
        print("Geocoding …")
        geocode(events)
        print("  geocoded:", sum(1 for e in events if e.get('lat')))
    OUT.write_text(json.dumps(events, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
