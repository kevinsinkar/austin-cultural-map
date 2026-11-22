import { tractPlace } from "../utils/places";

/**
 * AreaCard — the right-hand card for a named area chosen from the map's
 * area labels or the search box.
 *
 * An area here is a City of Austin planning boundary (a combined planning
 * area, a planning area, or a named sub-district). The map outlines it; this
 * card says what the outline is and connects it to the census tracts, which
 * is where every number on the site is counted. Tracts do not follow these
 * lines, so the card gives the overlap instead of pretending they match.
 */
const KIND_TEXT = {
  combined: "Combined planning area · City of Austin",
  area: "Planning area · City of Austin",
  sub: "Planning sub-district · City of Austin",
};

export default function AreaCard({ area, areaById, onClose, onSelectArea, onSelectTract, onSelectNeighborhood }) {
  if (!area) return null;
  const parent = area.parent ? areaById.get(area.parent) : null;
  const children = (area.children || []).map((id) => areaById.get(id)).filter(Boolean);
  const tracts = (area.tracts || [])
    .map(([id, ofArea, ofTract]) => ({ id, ofArea, ofTract, place: tractPlace(id) }))
    .filter((t) => t.place);

  return (
    <section className="side-card area-card" aria-labelledby="area-card-title">
      <div className="place-summary-head">
        <div style={{ minWidth: 0 }}>
          <p className="area-card-kind">{KIND_TEXT[area.kind]}</p>
          <h2 id="area-card-title" className="side-card-title">{area.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label={`Close ${area.name} and remove its outline from the map`}>
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {parent && (
        <p className="area-card-line">
          Part of{" "}
          <button type="button" className="link-button" onClick={() => onSelectArea(parent.id)}>{parent.name}</button>
          {parent.kind === "combined" ? ", a combined planning area." : "."}
        </p>
      )}
      {area.note && <p className="area-card-line">{area.note}</p>}

      <p className="area-card-explain">
        The dashed outline on the map is the City's boundary for this area. The figures on this
        site are counted by census tract, and tract lines do not follow it.
      </p>

      {children.length > 0 && (
        <>
          <h3 className="area-card-sub">{area.kind === "combined" ? "Planning areas inside it" : "Named sub-districts inside it"}</h3>
          <ul className="area-card-chips">
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className="btn-outline" onClick={() => onSelectArea(c.id)}>{c.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {area.hood && (
        <div className="area-card-hood">
          <p>
            This site's <strong>{area.name.replace(/\s*\(.*\)$/, "")}</strong> neighborhood is built from{" "}
            {area.hood.tracts === 1 ? "the one census tract" : `the ${area.hood.tracts} census tracts`} that sit
            almost wholly inside this boundary. Together they cover {area.hood.covers}% of it.
          </p>
          <button type="button" className="btn-solid btn-block" onClick={() => onSelectNeighborhood(area.hood.id)}>
            See its figures
          </button>
        </div>
      )}

      <h3 className="area-card-sub">Census tracts that overlap it</h3>
      {tracts.length ? (
        <ul className="area-card-tracts">
          {tracts.map((t) => (
            <li key={t.id}>
              <button type="button" className="area-card-tract" onClick={() => onSelectTract(t.id)}>
                <span className="area-card-tract-name">
                  {t.place.subtitle || t.place.title}
                  {t.place.subtitle ? <span className="area-card-tract-title"> · {t.place.title}</span> : null}
                </span>
                <span className="area-card-tract-share">
                  {t.ofArea}% of this area · {t.ofTract}% of the tract is inside
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="area-card-line">No census tract on this map overlaps it.</p>
      )}

      <p className="place-summary-note">
        Boundary: City of Austin, Neighborhood Planning Areas. Select a tract to see its figures.
      </p>
    </section>
  );
}
