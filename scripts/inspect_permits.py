import csv

path = r"C:\Users\k1s4l\Downloads\Issued_Construction_Permits_20260323.csv"

with open(path, "r", encoding="utf-8", errors="replace") as f:
    reader = csv.DictReader(f)
    header = reader.fieldnames
    print("=== ALL COLUMNS ===")
    for i, h in enumerate(header):
        print(f"  [{i}] {repr(h)}")
    print()
    row = next(reader)
    print("=== FIRST ROW (all fields) ===")
    for k, v in row.items():
        print(f"  {repr(k)}: {repr(v[:80] if v else v)}")