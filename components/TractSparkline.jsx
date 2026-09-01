import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi";
import { getDviBandColor } from "../utils/math";

// Fixed domains so every sparkline in a list shares the same scale
const X_MIN = 2000;
const X_MAX = 2023;
const Y_MAX = 100;

/**
 * Tiny inline DVI trend chart for one tract, built from actual DVI data
 * points only (no interpolation past data edges — gaps stay honest).
 * Line + endpoint dot, colored by the tract's latest DVI band.
 */
export default function TractSparkline({ regionId, width = 72, height = 20 }) {
  const series = (AUDITED_DVI_LOOKUP[regionId] || [])
    .filter((p) => p.year >= X_MIN)
    .slice()
    .sort((a, b) => a.year - b.year);

  if (series.length === 0) {
    return (
      <span style={{ fontSize: 9, color: "#c4b5a4", width, display: "inline-block", textAlign: "center" }}>
        no data
      </span>
    );
  }

  const pad = 2;
  const x = (yr) => pad + ((yr - X_MIN) / (X_MAX - X_MIN)) * (width - pad * 2);
  const y = (dvi) => height - pad - (Math.min(dvi, Y_MAX) / Y_MAX) * (height - pad * 2);

  const last = series[series.length - 1];
  const color = getDviBandColor(last.dvi);
  const points = series.map((p) => `${x(p.year).toFixed(1)},${y(p.dvi).toFixed(1)}`).join(" ");
  const summary = series.map((p) => `${p.year}: DVI ${p.dvi.toFixed(0)}`).join(" · ");

  return (
    <svg
      width={width}
      height={height}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={`DVI trend: ${summary}`}
    >
      <title>{summary}</title>
      {series.length > 1 ? (
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      ) : null}
      {series.map((p) => (
        <circle key={p.year} cx={x(p.year)} cy={y(p.dvi)} r={p.year === last.year ? 2 : 1.2} fill={color} />
      ))}
    </svg>
  );
}
