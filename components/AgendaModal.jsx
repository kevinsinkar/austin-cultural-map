export default function AgendaModal({ items, updated, loading, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Development agenda"
    >
      <div
        style={{
          background: "#fffffe",
          borderRadius: 12,
          maxWidth: 500,
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "24px 28px",
          boxShadow: "0 16px 48px rgba(0,0,0,.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h2
            style={{
              fontFamily: "'Newsreader',Georgia,serif",
              fontSize: 20,
              fontWeight: 600,
              color: "#1a1a1a",
              margin: 0,
            }}
          >
            Next on the Agenda
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "var(--muted)", cursor: "pointer", padding: 4 }}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#64615b", marginTop: 8, marginBottom: 16 }}>
          {loading ? "Loading the roadmap…" : updated ? `Roadmap last updated ${updated}` : "From docs/ISSUES.md"}
        </div>
        {!loading && items.length === 0 && (
          <p style={{ fontSize: 14, color: "#44403c", margin: 0 }}>No open items were found in docs/ISSUES.md.</p>
        )}
        <ul style={{ paddingLeft: 20, margin: 0, fontSize: 14, color: "#1a1a1a" }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 8 }}>{it}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}