/**
 * The Proof page. Every figure is read from validation.json, which the pipeline writes by
 * comparing our numbers with outside references; this file only puts them into words.
 */
import { POLAR_TEST_POINT, type ValidationFile, type ValidationRow, type ValidationSection, type ValidationSummary } from "./data/validate";
import { findSite, shortName } from "./sites";

const SCALE_MIN_POWER = -6;
const SCALE_MAX_POWER = 0;
const BODIES = { sun: "Sun", earth: "Earth" };

export const SCALE_TICKS: readonly number[] = [0.00001, 0.0001, 0.001, 0.01, 0.1];

export interface ProofRow {
  key: string;
  check: string;
  when: string | null;
  ours: string | null;
  reference: string | null;
  difference: string;
  limit: string;
  source: string | null;
  isPass: boolean;
}

export interface PlottedCheck {
  degrees: number;
  isPass: boolean;
}

export interface ProofSection {
  id: string;
  title: string;
  method: string;
  rows: ProofRow[];
  passed: number;
  /** False where the file gives only the difference. */
  hasFigures: boolean;
  /** The differences in degrees, for the scale; empty for checks that are not angles. */
  plotted: PlottedCheck[];
  limitDeg: number | null;
}

export function siteLabel(id: string): string {
  const site = findSite(id);
  if (site) return shortName(site);
  return id === POLAR_TEST_POINT ? "South polar test point, 89.45° S" : id;
}

export const formatDegrees = (value: number) => `${value.toFixed(6)}°`;

function proofRow(row: ValidationRow): Omit<ProofRow, "key"> {
  const isPass = row.pass;
  const when = "utc" in row ? `${row.utc} UTC` : null;
  switch (row.kind) {
    case "horizons":
      return {
        check: `${siteLabel(row.site)}, ${BODIES[row.body]}`,
        when,
        ours: `az ${row.ours.az}°, el ${row.ours.el}°`,
        reference: `az ${row.reference.az}°, el ${row.reference.el}°`,
        difference: formatDegrees(row.diff_deg),
        limit: `${row.tolerance_deg}°`,
        source: null,
        isPass,
      };
    case "browser":
      return { check: siteLabel(row.site), when, ours: null, reference: null, difference: formatDegrees(row.diff_deg), limit: `${row.tolerance_deg}°`, source: null, isPass };
    case "dsn":
      return {
        check: row.station,
        when,
        ours: `el ${row.ours_el}°`,
        reference: `el ${row.reference_el}°`,
        difference: formatDegrees(row.diff_deg),
        limit: `${row.tolerance_deg}°`,
        source: null,
        isPass,
      };
    case "terrain":
      return {
        check: row.check,
        when,
        ours: `${row.ours} ${row.unit}`,
        reference: `${row.reference} ${row.unit}`,
        difference: `${row.diff} ${row.unit}`,
        limit: `${row.tolerance} ${row.unit}`,
        source: row.reference_source,
        isPass,
      };
  }
}

function proofSection({ id, title, method, rows }: ValidationSection): ProofSection {
  const angles = rows.flatMap((row) => (row.kind === "terrain" ? [] : [row]));
  return {
    id,
    title,
    method,
    rows: rows.map((row, i) => ({ key: `${id}-${i}`, ...proofRow(row) })),
    passed: rows.filter(({ pass }) => pass).length,
    hasFigures: rows.some(({ kind }) => kind !== "browser"),
    plotted: angles.map(({ diff_deg, pass }) => ({ degrees: diff_deg, isPass: pass })),
    limitDeg: angles.length > 0 ? Math.max(...angles.map(({ tolerance_deg }) => tolerance_deg)) : null,
  };
}

export const proofSections = (file: ValidationFile): ProofSection[] => file.sections.map(proofSection);

export interface ProofHeadline {
  lead: string;
  emphasis: string;
  isClean: boolean;
}

export function proofHeadline({ checks, passed }: ValidationSummary): ProofHeadline {
  const failed = checks - passed;
  return { lead: `${passed} of ${checks} checks `, emphasis: failed === 0 ? "passed." : `passed. ${failed} failed.`, isClean: failed === 0 };
}

/** Where a difference sits on the page's logarithmic scale, in percent. */
export function evidenceScale(degrees: number): number {
  const power = Math.log10(Math.max(degrees, 10 ** SCALE_MIN_POWER));
  return Math.min(100, ((power - SCALE_MIN_POWER) / (SCALE_MAX_POWER - SCALE_MIN_POWER)) * 100);
}
