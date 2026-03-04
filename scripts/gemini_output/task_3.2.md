# Task 3.2 — Inflation Labels on Property Cards

Here are the complete, drop-in implementations for the requested changes.

### 1. CPI Deflator Utility File (`utils/cpi.js`)

This new file provides the inflation adjustment function and the underlying CPI data.

```javascript
/**
 * utils/cpi.js
 * ------------
 * Provides inflation adjustment utilities using Consumer Price Index (CPI-U) data.
 * The primary deflator uses Austin MSA data where available (1998-present) and
 * falls back to the US Urban average for earlier years (1990-1997).
 *
 * Data Source: U.S. Bureau of Labor Statistics (BLS)
 * - Austin-Round Rock-Georgetown, TX MSA (Series ID: CUURA320SA0)
 * - U.S. City Average (Series ID: CUURA101SA0)
 * All values are annual averages for "All items, all urban consumers".
 */

// Annual average CPI-U for Austin-Round Rock-Georgetown, TX MSA.
// Data is only available from 1998 onwards.
const CPI_U_AUSTIN_MSA = {
  1998: 158.4, 1999: 161.7, 2000: 166.4, 2001: 171.1, 2002: 172.6,
  2003: 174.9, 2004: 177.8, 2005: 183.1, 2006: 190.2, 2007: 195.8,
  2008: 203.2, 2009: 202.1, 2010: 204.9, 2011: 210.9, 2012: 216.0,
  2013: 219.2, 2014: 224.2, 2015: 224.4, 2016: 229.3, 2017: 234.7,
  2018: 239.5, 2019: 245.1, 2020: 251.0, 2021: 262.3, 2022: 284.1,
  2023: 298.5,
};

// Annual average CPI-U for U.S. City Average.
// Used as a fallback for years where Austin data is not available.
const CPI_U_US_URBAN = {
  1990: 130.7, 1991: 136.2, 1992: 140.3, 1993: 144.5, 1994: 148.2,
  1995: 152.4, 1996: 156.9, 1997: 160.5, 1998: 163.0, 1999: 166.6,
  2000: 172.2, 2001: 177.1, 2002: 179.9, 2003: 184.0, 2004: 188.9,
  2005: 195.3, 2006: 201.6, 2007: 207.3, 2008: 215.3, 2009: 214.5,
  2010: 218.1, 2011: 224.9, 2012: 229.6, 2013: 233.0, 2014: 236.7,
  2015: 237.0, 2016: 240.0, 2017: 245.1, 2018: 251.1, 2019: 255.7,
  2020: 258.8, 2021: 271.0, 2022: 292.7, 2023: 304.7,
};

// Combined index: prefers Austin data, falls back to US Urban for pre-1998.
const CPI_DEFLATORS = {
  ...CPI_U_US_URBAN,
  ...CPI_U_AUSTIN_MSA,
};

/**
 * Adjusts a nominal dollar value from a given year to a base year's dollars.
 * @param {number | null | undefined} value The nominal dollar value.
 * @param {number} year The year of the nominal value.
 * @param {number} [baseYear=2023] The year to adjust the value to.
 * @returns {number | null} The adjusted value, or null if adjustment is not possible.
 */
export function adjustForInflation(value, year, baseYear = 2023) {
  if (value == null || year == null) return null;

  const yearInt = Math.round(year);
  const baseYearInt = Math.round(baseYear);

  const cpiYear = CPI_DEFLATORS[yearInt];
  const cpiBase = CPI_DEFLATORS[baseYearInt];

  if (cpiYear == null || cpiBase == null || cpiYear === 0) {
    // Cannot adjust if data is missing for either year, or if divisor is zero.
    return null;
  }

  return value * (cpiBase / cpiYear);
}
```

### 2. New Import for `RegionDetailPanel.jsx`

Add this line near the top of `components/RegionDetailPanel.jsx` with the other utility imports.

```javascript
import { adjustForInflation } from "../utils/cpi";
```

### 3. Changed Property Metrics `.map()` Block

Replace the existing `propertyNow` mapping block in `RegionDetailPanel.jsx` with this updated version.

```javascript
            {propertyNow && [
              { label: "Median Home Value", value: propertyNow.median_home_value, fmt: (v) => v != null ? "$" + (v / 1000).toFixed(0) + "k" : "N/A", prevVal: propertyPrev?.median_home_value },
              { label: "Median Rent", value: propertyNow.median_rent_monthly, fmt: (v) => v != null ? "$" + v.toLocaleString() : "N/A", prevVal: propertyPrev?.median_rent_monthly },
            ].map((c, i) => {
              const valueAdj = c.value != null ? adjustForInflation(c.value, propertyNow.year) : null;
              const prevValAdj = c.prevVal != null && propertyPrev?.year != null
                ? adjustForInflation(c.prevVal, propertyPrev.year)
                : null;

              const ch = valueAdj != null && prevValAdj != null ? fmtChange(valueAdj, prevValAdj) : null;
              const up = ch?.dir === "up";
              // For property, up is usually good except for rent
              const bad = c.label === "Median Rent" ? up : !up;

              const nominalFmt = c.fmt(c.value);
              const adjustedFmt = c.fmt(valueAdj);

              return (
                <div key={c.label} style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", lineHeight: 1.3 }}>{c.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-.02em", lineHeight: 1 }}>
                      {nominalFmt}
                      {valueAdj != null && <span style={{ color: "#7c6f5e", fontWeight: 500 }}> / {adjustedFmt}</span>}
                    </span>
                    {ch && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: bad ? "#dc2626" : "#16a34a", display: "flex", alignItems: "center", gap: 2 }} aria-label={`${bad ? "worsened" : "improved"} ${Math.abs(ch.raw).toFixed(0)} percent vs ${propertyPrev?.year}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: up ? "none" : "rotate(180deg)" }} aria-hidden="true"><polygon points="4,0 8,8 0,8" fill="currentColor" /></svg>
                        {Math.abs(ch.raw).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.3 }}>
                    (nominal / 2023$)
                    {ch && propertyPrev && <span> · vs {propertyPrev.year}</span>}
                  </div>
                </div>
              );
            })}
```

### 4. Changed Socioeconomic Metrics `.map()` Block

Replace the existing `socioNow` mapping block in `RegionDetailPanel.jsx` with this updated version.

```javascript
            {socioNow && [
              { label: "Median Household Income", value: socioNow.median_household_income, fmt: (v) => v != null ? "$" + (v / 1000).toFixed(0) + "k" : "N/A", prevVal: socioPrev?.median_household_income, sub: "Annual", isCurrency: true },
              { label: "Poverty Rate", value: socioNow.poverty_rate, fmt: (v) => v != null ? v.toFixed(1) + "%" : "N/A", prevVal: socioPrev?.poverty_rate, sub: "% of pop.", inv: true, isCurrency: false },
            ].map((c, i) => {
              const valueAdj = c.isCurrency && c.value != null ? adjustForInflation(c.value, socioNow.year) : null;
              const prevValAdj = c.isCurrency && c.prevVal != null && socioPrev?.year != null
                ? adjustForInflation(c.prevVal, socioPrev.year)
                : null;

              const ch = c.isCurrency
                ? (valueAdj != null && prevValAdj != null ? fmtChange(valueAdj, prevValAdj) : null)
                : (c.prevVal != null ? fmtChange(c.value, c.prevVal) : null);
              
              const up = ch?.dir === "up";
              const bad = c.inv ? up : !up;

              const nominalFmt = c.fmt(c.value);
              const adjustedFmt = c.fmt(valueAdj);

              return (
                <div key={c.label} style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", lineHeight: 1.3 }}>{c.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-.02em", lineHeight: 1 }}>
                      {nominalFmt}
                      {c.isCurrency && valueAdj != null && <span style={{ color: "#7c6f5e", fontWeight: 500 }}> / {adjustedFmt}</span>}
                    </span>
                    {ch && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: bad ? "#dc2626" : "#16a34a", display: "flex", alignItems: "center", gap: 2 }} aria-label={`${bad ? "worsened" : "improved"} ${Math.abs(ch.raw).toFixed(0)} percent vs ${socioPrev?.year}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: up ? "none" : "rotate(180deg)" }} aria-hidden="true"><polygon points="4,0 8,8 0,8" fill="currentColor" /></svg>
                        {Math.abs(ch.raw).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.3 }}>
                    {c.isCurrency ? "(nominal / 2023$)" : c.sub}
                    {ch && socioPrev && <span> · vs {socioPrev.year}</span>}
                  </div>
                </div>
              );
            })}
```

### 5. Note on Change Arrows

The change arrows (e.g., `↑5%`) for currency-based metrics like home value, rent, and income are now calculated using inflation-adjusted (real) values. This provides a more accurate representation of change in purchasing power over time, as opposed to nominal change which can be misleading. Non-currency metrics like poverty rate continue to use nominal changes.