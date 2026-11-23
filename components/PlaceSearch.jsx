import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LEGACY_OPERATING, LEGACY_CLOSED } from "../data";
import { placeSearchIndex } from "../utils/places";
import { AREA_NAMES } from "../data/areaNames";

/**
 * PlaceSearch — find a place without having to click the map.
 *
 * Matches neighborhoods, census tracts (by name or number) and tracked
 * cultural anchors as you type; all of that happens in the browser. With
 * the box empty it lists every named neighborhood, so it also works as a
 * plain list for keyboard and screen-reader users.
 *
 * A street address needs a geocoder. That lookup only runs when the person
 * chooses "Look up this address", and it sends the typed text to
 * OpenStreetMap's Nominatim service (the same project that serves the map
 * tiles). Nothing is sent while typing.
 */

// Rough box around the mapped area: west, north, east, south.
const VIEWBOX = "-98.05,30.60,-97.45,30.03";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const KIND_LABEL = { neighborhood: "Neighborhood", tract: "Census tract", anchor: "Cultural anchor", area: "City boundary" };

// City planning areas: choosing one outlines its boundary on the map.
const areaIndex = () => AREA_NAMES.map((a) => ({
  key: `area:${a.id}`, kind: "area", id: a.id, label: a.name, detail: a.detail, haystack: a.name.toLowerCase(),
}));

function anchorIndex() {
  const row = (b, closed) => ({
    key: `anchor:${b.id}`, kind: "anchor", id: b.id, business: b,
    label: b.name,
    detail: (closed ? `Closed ${b.closed || ""}`.trim() : `Operating since ${b.est}`) + (b.unverified ? " · unverified" : ""),
    haystack: `${b.name} ${b.address || ""}`.toLowerCase(),
  });
  return [
    ...LEGACY_OPERATING.filter((b) => b.lat && b.lng).map((b) => row(b, false)),
    ...LEGACY_CLOSED.filter((b) => b.lat && b.lng).map((b) => row(b, true)),
  ];
}

export default function PlaceSearch({ onSelectTract, onSelectNeighborhood, onSelectAnchor, onSelectArea, onAddress }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const places = useMemo(() => placeSearchIndex(), []);
  const anchors = useMemo(() => anchorIndex(), []);
  const areas = useMemo(() => areaIndex(), []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) {
      // Empty box: the full list of named neighborhoods, A to Z.
      return places
        .filter((p) => p.kind === "neighborhood")
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (item) => tokens.every((t) => item.haystack.includes(t));
    // Names that start with the text first; among those, neighborhoods
    // (which carry figures), then City boundaries, then single tracts.
    const KIND_RANK = { neighborhood: 0, area: 0.25, tract: 0.5 };
    const rank = (item) => (item.label.toLowerCase().startsWith(q) ? 0 : 1) + KIND_RANK[item.kind];
    const placeHits = [...places, ...areas].filter(match).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, 12);
    const anchorHits = anchors.filter(match).slice(0, 4);
    return [...placeHits, ...anchorHits];
  }, [q, places, anchors, areas]);

  // Offer the address lookup once there is enough text to be an address.
  const offerAddress = q.length >= 5;
  const optionCount = results.length + (offerAddress ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const close = (message) => {
    setOpen(false);
    setActive(-1);
    if (message != null) setStatus(message);
  };

  const choose = (item) => {
    if (item.kind === "neighborhood") onSelectNeighborhood?.(item.id);
    else if (item.kind === "tract") onSelectTract?.(item.id);
    else if (item.kind === "anchor") onSelectAnchor?.(item.business);
    else if (item.kind === "area") onSelectArea?.(item.id);
    setQuery(item.label);
    close(`Showing ${item.label}.`);
  };

  const lookUpAddress = async () => {
    const text = query.trim();
    if (!text || pending) return;
    setPending(true);
    setStatus("Looking up that address…");
    try {
      const params = new URLSearchParams({
        format: "jsonv2", limit: "1", countrycodes: "us", bounded: "1", viewbox: VIEWBOX,
        q: /austin/i.test(text) ? text : `${text}, Austin, Texas`,
      });
      const res = await fetch(`${NOMINATIM}?${params}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const hits = await res.json();
      if (!hits.length) {
        close("No address in the Austin area matched that. Try adding a street type, such as St or Ave.");
        return;
      }
      const lat = parseFloat(hits[0].lat);
      const lng = parseFloat(hits[0].lon);
      const outcome = onAddress?.({ lat, lng, label: text });
      close(outcome?.title
        ? `That address is in ${outcome.title}.`
        : "That address is outside the area this map covers.");
    } catch {
      close("The address lookup is not available right now. You can still search by neighborhood or select the map.");
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => (optionCount ? (i + 1) % optionCount : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (optionCount ? (i - 1 + optionCount) % optionCount : -1));
    } else if (e.key === "Enter") {
      if (!open) { setOpen(true); return; }
      e.preventDefault();
      if (active >= 0 && active < results.length) choose(results[active]);
      else if (offerAddress && (active === results.length || results.length === 0)) lookUpAddress();
      else if (results.length === 1) choose(results[0]);
    } else if (e.key === "Escape") {
      if (open) { e.stopPropagation(); close(); }
    }
  };

  const optionId = (i) => `${listId}-opt-${i}`;

  return (
    <div
      ref={rootRef}
      className="place-search"
      // Tabbing on to the next control closes the list instead of leaving it
      // open over the map.
      onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false); }}
    >
      <label htmlFor={`${listId}-input`} className="visually-hidden">
        Find a place by neighborhood, census tract number or street address
      </label>
      <div className="place-search-box">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="7" cy="7" r="5" stroke="#64615b" strokeWidth="1.6" />
          <path d="M11 11l3.5 3.5" stroke="#64615b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          placeholder="Find a neighborhood or address"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <div className="place-search-panel" tabIndex={-1}>
          {!q && (
            <div className="place-search-hint">
              Type a neighborhood, a census tract number or a street address, or pick a neighborhood:
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Matching places" className="place-search-list">
            {results.map((item, i) => (
              <li
                key={item.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`place-search-option${i === active ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="place-search-label">{item.label}</span>
                <span className="place-search-detail">
                  {item.kind === "tract"
                    ? (item.detail || KIND_LABEL.tract)
                    : item.kind === "area"
                      ? `${KIND_LABEL.area} · ${item.detail}`
                      : `${KIND_LABEL[item.kind]}${item.detail ? ` · ${item.detail}` : ""}`}
                </span>
              </li>
            ))}
            {offerAddress && (
              <li
                id={optionId(results.length)}
                role="option"
                aria-selected={active === results.length}
                aria-disabled={pending}
                className={`place-search-option place-search-address${active === results.length ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={lookUpAddress}
                onMouseEnter={() => setActive(results.length)}
              >
                <span className="place-search-label">
                  {pending ? "Looking up…" : <>Look up “{query.trim()}” as a street address</>}
                </span>
                <span className="place-search-detail">
                  Sends this text to OpenStreetMap's address service
                </span>
              </li>
            )}
            {q && !results.length && !offerAddress && (
              <li className="place-search-empty" role="presentation">No neighborhood, area or tract matches yet. Keep typing.</li>
            )}
          </ul>
        </div>
      )}

      <div role="status" aria-live="polite" className={status ? "place-search-status" : "visually-hidden"}>
        {status}
      </div>
    </div>
  );
}
