"use client";

import { LessonCard } from "@/components/classroom/LessonCard";
import { DataNotice } from "@/components/data/DataNotice";
import { CALCULATING, DATA_FAILED, proofAnswer } from "@/lib/classroomAnswers";
import { dataLoader } from "@/lib/data/loader";
import { useDataFile } from "@/lib/data/useDataFile";
import type { ValidationFile } from "@/lib/data/validate";
import { evidenceScale, formatDegrees, proofHeadline, proofSections, SCALE_TICKS, type PlottedCheck, type ProofRow, type ProofSection } from "@/lib/proof";
import { formatUtc } from "@/lib/selection";
import styles from "./proof.module.css";

const VALIDATION_SCRIPT = "https://github.com/Mozahid-DIU/LunaHorizon/blob/main/pipeline/validation.py";
const HORIZONS = "https://ssd.jpl.nasa.gov/horizons/";

function Scale({ plotted, limitDeg, title }: { plotted: readonly PlottedCheck[]; limitDeg: number; title: string }) {
  const worst = Math.max(...plotted.map(({ degrees }) => degrees));
  const failed = plotted.filter(({ isPass }) => !isPass).length;
  return (
    <div className={styles.scale} role="img" aria-label={`${title}: largest difference ${formatDegrees(worst)}, limit ${limitDeg}°, ${failed} failed`}>
      <div className={styles.scaleTrack}>
        {plotted.map(({ degrees, isPass }, i) => (
          <i key={i} className={isPass ? styles.dot : styles.dotFailed} style={{ left: `${evidenceScale(degrees)}%` }} />
        ))}
        <b className={styles.limit} style={{ left: `${evidenceScale(limitDeg)}%` }}>
          <span>limit {limitDeg}°</span>
        </b>
      </div>
      <div className={styles.ticks} aria-hidden="true">
        {SCALE_TICKS.map((degrees) => (
          <span key={degrees} style={{ left: `${evidenceScale(degrees)}%` }}>
            {degrees}°
          </span>
        ))}
      </div>
    </div>
  );
}

function RowResult({ isPass }: { isPass: boolean }) {
  return <td className={isPass ? styles.pass : styles.fail}>{isPass ? "Pass" : "Fail"}</td>;
}

function ChecksTable({ section }: { section: ProofSection }) {
  const hasWhen = section.rows.some(({ when }) => when !== null);
  const rowCells = (row: ProofRow) => (
    <>
      <th scope="row">
        {row.check}
        {row.source && <small>{row.source}</small>}
      </th>
      {hasWhen && <td>{row.when}</td>}
      {section.hasFigures && <td>{row.ours}</td>}
      {section.hasFigures && <td>{row.reference}</td>}
      <td>{row.difference}</td>
      <td>{row.limit}</td>
      <RowResult isPass={row.isPass} />
    </>
  );
  return (
    <div className={styles.tableWrap} tabIndex={0} role="group" aria-label={`${section.title}, all checks`}>
      <table>
        <thead>
          <tr>
            <th scope="col">Check</th>
            {hasWhen && <th scope="col">Time</th>}
            {section.hasFigures && <th scope="col">Ours</th>}
            {section.hasFigures && <th scope="col">Reference</th>}
            <th scope="col">Difference</th>
            <th scope="col">Limit</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.key} data-testid="proof-row">
              {rowCells(row)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ section }: { section: ProofSection }) {
  const { id, title, method, rows, passed, plotted, limitDeg } = section;
  const isClean = passed === rows.length;
  return (
    <section className={styles.section} aria-labelledby={`proof-${id}`}>
      <div className={styles.sectionHead}>
        <h2 id={`proof-${id}`}>{title}</h2>
        <strong className={isClean ? styles.pass : styles.fail}>
          {passed} of {rows.length}
          {!isClean && ` · ${rows.length - passed} failed`}
        </strong>
      </div>
      <p className={styles.method}>{method}</p>
      {limitDeg !== null && <Scale plotted={plotted} limitDeg={limitDeg} title={title} />}
      {limitDeg === null ? (
        <ChecksTable section={section} />
      ) : (
        <details open={!isClean}>
          <summary>See all {rows.length} checks</summary>
          <ChecksTable section={section} />
        </details>
      )}
    </section>
  );
}

function Results({ file }: { file: ValidationFile }) {
  const { lead, emphasis, isClean } = proofHeadline(file.summary);
  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>How we check our numbers</p>
        <h1>
          {lead}
          <em className={isClean ? "" : styles.fail}>{emphasis}</em>
        </h1>
        <p className={styles.lead}>
          The largest angle difference is <strong>{formatDegrees(file.summary.max_angle_diff_deg)}</strong>. For scale, the Sun looks about 0.53° wide from the Moon.
        </p>
        <p className={styles.note}>
          We compare against <a href={HORIZONS}>NASA JPL Horizons</a> and published terrain results, and the browser engine against our full SPICE calculation.{" "}
          <a href={VALIDATION_SCRIPT}>Our validation script</a> is open source and can be re-run after downloading NASA&apos;s data. Results from{" "}
          {formatUtc(Date.parse(`${file.generated}T00:00Z`)).split(",")[0]}.
        </p>
      </div>
      <LessonCard id="proof" answer={proofAnswer(file.summary.max_angle_diff_deg, formatDegrees(file.summary.max_angle_diff_deg))} />
      {proofSections(file).map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </>
  );
}

export function ProofView() {
  const data = useDataFile(dataLoader.loadValidation);
  if (data.status === "ready") return <Results file={data.value} />;
  return (
    <>
      <div className={styles.intro}>
        <h1>Proof</h1>
      </div>
      <LessonCard id="proof" answer={data.status === "error" ? DATA_FAILED : CALCULATING} />
      {data.status === "loading" ? <p className={styles.note}>Loading the checks…</p> : <DataNotice error={data.error} retry={data.retry} />}
    </>
  );
}
