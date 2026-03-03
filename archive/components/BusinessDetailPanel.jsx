export default function BusinessDetailPanel({ business, onClose }) {
  if (!business) return null;

  const isOperating = !business.closed;
  const years = isOperating ? `Est. ${business.est}` : `${business.est} – ${business.closed}`;

  return (
    <div style={{
      position: "fixed",
      right: 0,
      top: 0,
      bottom: 0,
      width: 360,
      background: "#fffffe",
      borderLeft: "1px solid #e8e5e0",
      boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.1)",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      animation: "slideIn 0.3s ease-out",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "start",
        padding: "20px 16px",
        borderBottom: "1px solid #e8e5e0",
      }}>
        <div>
          <h2 style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 8px",
            lineHeight: 1.3,
            paddingRight: 24,
          }}>
            {business.name}
          </h2>
          <div style={{
            fontSize: 12,
            color: "#64615b",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isOperating ? "#4ade80" : "#a8a49c",
            }} />
            {isOperating ? "Operating" : "Closed/Displaced"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "#a8a49c",
            padding: "0 4px 4px",
            flexShrink: 0,
          }}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "16px",
      }}>
        {/* Timeline Info */}
        <div style={{
          marginBottom: 20,
          padding: "12px",
          background: "#f9f7f3",
          borderRadius: 8,
          borderLeft: "3px solid " + (isOperating ? "#4ade80" : "#a8a49c"),
        }}>
          <div style={{ fontSize: 11, color: "#64615b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
            Timeline
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
            {years}
          </div>
          {!isOperating && business.cause && (
            <div style={{ fontSize: 12, color: "#64615b", marginTop: 6 }}>
              <strong>Cause:</strong> {business.cause}
            </div>
          )}
          {!isOperating && business.replacedBy && (
            <div style={{ fontSize: 12, color: "#64615b", marginTop: 4 }}>
              <strong>Replaced by:</strong> {business.replacedBy}
            </div>
          )}
        </div>

        {/* Business Details */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 12 }}>
            Business Information
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600, marginBottom: 2 }}>Type</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500 }}>{business.type}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600, marginBottom: 2 }}>Culture</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500 }}>{business.culture}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600, marginBottom: 2 }}>Ownership</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500 }}>{business.ownership}</div>
            </div>
            {isOperating && business.pressure && (
              <div>
                <div style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600, marginBottom: 2 }}>Pressure Level</div>
                <div style={{
                  fontSize: 12,
                  color: "#1a1a1a",
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 3,
                  display: "inline-block",
                  background: business.pressure === "Critical" ? "#fee2e2" : business.pressure === "High" ? "#fef3c7" : "#e0f2fe",
                  color: business.pressure === "Critical" ? "#991b1b" : business.pressure === "High" ? "#92400e" : "#0c4a6e",
                }}>
                  {business.pressure}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Location */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
            Location
          </div>
          <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500, marginBottom: 4 }}>
            {business.address}
          </div>
          <div style={{ fontSize: 12, color: "#64615b" }}>
            {business.region}
          </div>
        </div>

        {/* Heritage / Landmark */}
        {business.heritage && business.heritage !== "None" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
              Heritage Status
            </div>
            <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500, padding: "6px 10px", background: "#f0fdfa", borderRadius: 4, borderLeft: "3px solid #0f766e" }}>
              {business.heritage}
            </div>
          </div>
        )}

        {business.landmark && business.landmark !== "No" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
              Landmark Status
            </div>
            <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 500, padding: "6px 10px", background: "#faf3ff", borderRadius: 4, borderLeft: "3px solid #7c3aed" }}>
              {business.landmark}
            </div>
          </div>
        )}

        {/* Notes */}
        {business.notes && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
              Notes
            </div>
            <div style={{ fontSize: 12, color: "#44403c", lineHeight: 1.6 }}>
              {business.notes}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
