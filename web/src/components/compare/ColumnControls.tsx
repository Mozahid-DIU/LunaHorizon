"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { extraFor, type CompareExtra } from "@/lib/compare";
import { DATA_END_MS, DATA_START_MS } from "@/lib/dataRange";
import { customSite, fromDateInput, parseCoordinate, toDateInput } from "@/lib/selection";
import { findSite, SITES } from "@/lib/sites";
import styles from "./compare.module.css";

const CUSTOM = "custom";

interface DateDraft {
  /** The column's time when the draft began; a later change discards the draft. */
  forMs: number;
  text: string;
}

interface ColumnControlsProps {
  position: number;
  extra: CompareExtra;
  timeMs: number;
  mainTimeMs: number;
  onChange: (extra: CompareExtra) => void;
  onRemove: () => void;
}

export function ColumnControls({ position, extra, timeMs, mainTimeMs, onChange, onRemove }: ColumnControlsProps) {
  const { site } = extra;
  const [isEditing, setIsEditing] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [dateDraft, setDateDraft] = useState<DateDraft | null>(null);
  const siteBox = useRef<HTMLSelectElement>(null);
  const latBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) latBox.current?.focus();
  }, [isEditing]);

  const dateText = dateDraft?.forMs === timeMs ? dateDraft.text : toDateInput(timeMs);
  const isDateBad = fromDateInput(dateText) === null;
  const isLatBad = isChecked && parseCoordinate(lat, 90) === null;
  const isLonBad = isChecked && parseCoordinate(lon, 180) === null;

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
    const chosen = findSite(event.target.value);
    if (!chosen) {
      openCustomForm();
      return;
    }
    setIsEditing(false);
    onChange(extraFor(chosen, timeMs, mainTimeMs));
  };

  const onDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDateDraft({ forMs: timeMs, text: event.target.value });
    const ms = fromDateInput(event.target.value);
    if (ms !== null) onChange(extraFor(site, ms, mainTimeMs));
  };

  const onApply = (event: FormEvent) => {
    event.preventDefault();
    setIsChecked(true);
    const parsedLat = parseCoordinate(lat, 90);
    const parsedLon = parseCoordinate(lon, 180);
    if (parsedLat === null || parsedLon === null) return;
    onChange(extraFor(customSite(parsedLat, parsedLon), timeMs, mainTimeMs));
    closeCustomForm();
  };

  return (
    <div className={styles.controls}>
      <select ref={siteBox} aria-label={`Site in column ${position}`} value={isEditing || site.id === null ? CUSTOM : site.id} onChange={onSiteChange}>
        {SITES.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
        <option value={CUSTOM}>{site.id === null ? `Custom: ${site.lat}°, ${site.lon}°` : "Custom coordinates…"}</option>
      </select>
      <input
        aria-label={`Date in column ${position}, UTC`}
        aria-invalid={isDateBad}
        type="datetime-local"
        step={60}
        min={toDateInput(DATA_START_MS)}
        max={toDateInput(DATA_END_MS)}
        value={dateText}
        onChange={onDateChange}
        onBlur={() => setDateDraft(null)}
      />
      {isDateBad && <p role="alert">Choose a date from 2026 to 2030.</p>}
      {isEditing && (
        <form className={styles.custom} onSubmit={onApply} noValidate>
          <label>
            Latitude
            <input ref={latBox} inputMode="decimal" aria-invalid={isLatBad} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-85.25" />
          </label>
          <label>
            Longitude
            <input inputMode="decimal" aria-invalid={isLonBad} value={lon} onChange={(e) => setLon(e.target.value)} placeholder="120" />
          </label>
          {isLatBad && <p role="alert">Latitude must be between -90 and 90.</p>}
          {isLonBad && <p role="alert">Longitude must be between -180 and 180.</p>}
          <button type="submit">Apply</button>
          <button type="button" onClick={closeCustomForm}>
            Cancel
          </button>
        </form>
      )}
      <div className={styles.columnActions}>
        {site.id === null && !isEditing && (
          <button type="button" onClick={openCustomForm}>
            Edit coordinates
          </button>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove column ${position}`}>
          Remove
        </button>
      </div>
    </div>
  );
}
