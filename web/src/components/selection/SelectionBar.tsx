"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { DATA_END_MS, DATA_START_MS } from "@/lib/dataRange";
import { customSite, fromDateInput, parseCoordinate, toDateInput } from "@/lib/selection";
import { findSite, SITES } from "@/lib/sites";
import styles from "./selection.module.css";
import { useSelection } from "./useSelection";

const CUSTOM = "custom";

interface DateDraft {
  /** The time in the address when the draft began; a later change discards the draft. */
  forMs: number;
  text: string;
}

export function SelectionBar() {
  const { selection, problems, update } = useSelection();
  const { site, timeMs } = selection;
  const [isEditing, setIsEditing] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [dateDraft, setDateDraft] = useState<DateDraft | null>(null);
  const siteBox = useRef<HTMLSelectElement>(null);
  const latBox = useRef<HTMLInputElement>(null);

  const isLatBad = isChecked && parseCoordinate(lat, 90) === null;
  const isLonBad = isChecked && parseCoordinate(lon, 180) === null;
  const dateText = dateDraft?.forMs === timeMs ? dateDraft.text : toDateInput(timeMs);
  const isDateBad = fromDateInput(dateText) === null;

  useEffect(() => {
    if (isEditing) latBox.current?.focus();
  }, [isEditing]);

  const openCustomForm = () => {
    setLat(site.id === null ? String(site.lat) : "");
    setLon(site.id === null ? String(site.lon) : "");
    setIsChecked(false);
    setIsEditing(true);
  };

  const closeCustomForm = () => {
    setIsEditing(false);
    siteBox.current?.focus();
  };

  const onSiteChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (id === CUSTOM) {
      openCustomForm();
      return;
    }
    const chosen = findSite(id);
    if (!chosen) return;
    setIsEditing(false);
    update({ site: chosen });
  };

  const onDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDateDraft({ forMs: timeMs, text: event.target.value });
    const ms = fromDateInput(event.target.value);
    if (ms !== null) update({ timeMs: ms });
  };

  const onApply = (event: FormEvent) => {
    event.preventDefault();
    setIsChecked(true);
    const parsedLat = parseCoordinate(lat, 90);
    const parsedLon = parseCoordinate(lon, 180);
    if (parsedLat === null || parsedLon === null) return;
    update({ site: customSite(parsedLat, parsedLon) });
    closeCustomForm();
  };

  const isCustomShown = site.id === null && !isEditing;
  const hasNotes = isCustomShown || isDateBad || problems.length > 0;

  return (
    <div className={styles.bar}>
      <select
        ref={siteBox}
        aria-label="Landing site"
        className={styles.control}
        value={isEditing || site.id === null ? CUSTOM : site.id}
        onChange={onSiteChange}
      >
        {SITES.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
        <option value={CUSTOM}>{site.id === null ? `Custom: ${site.lat}°, ${site.lon}°` : "Custom coordinates…"}</option>
      </select>

      <span className={styles.date}>
        <input
          aria-label="Date and time, UTC"
          aria-invalid={isDateBad}
          className={styles.control}
          type="datetime-local"
          step={60}
          min={toDateInput(DATA_START_MS)}
          max={toDateInput(DATA_END_MS)}
          value={dateText}
          onChange={onDateChange}
          onBlur={() => setDateDraft(null)}
        />
        <span aria-hidden="true">UTC</span>
      </span>

      <div className={`${styles.notes} ${hasNotes ? styles.notesShown : ""}`}>
        {isCustomShown && (
          <div className={styles.customInfo}>
            {!site.has_terrain && <span className={styles.tag}>Terrain not included</span>}
            <button type="button" className={styles.edit} onClick={openCustomForm}>
              Edit coordinates
            </button>
          </div>
        )}
        {isDateBad && <p role="alert">Choose a date from 2026 to 2030.</p>}
        <p role="status">{problems.join(" ")}</p>
      </div>

      {isEditing && (
        <form className={styles.custom} onSubmit={onApply} noValidate>
          <label>
            Latitude
            <input
              ref={latBox}
              inputMode="decimal"
              aria-invalid={isLatBad}
              aria-describedby={isLatBad ? "lat-error" : undefined}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-85.25"
            />
          </label>
          {isLatBad && <p id="lat-error">Latitude must be between -90 and 90.</p>}
          <label>
            Longitude
            <input
              inputMode="decimal"
              aria-invalid={isLonBad}
              aria-describedby={isLonBad ? "lon-error" : undefined}
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="120"
            />
          </label>
          {isLonBad && <p id="lon-error">Longitude must be between -180 and 180.</p>}
          <p className={styles.hint}>South of 65° S, terrain comes from NASA height maps. Elsewhere, Sun and Earth are shown over a flat horizon.</p>
          <div className={styles.actions}>
            <button type="submit">Apply</button>
            <button type="button" onClick={closeCustomForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Holds the same space while the address is read, so the header does not jump. */
export function SelectionBarFallback() {
  return <div className={styles.bar} aria-hidden="true" />;
}
