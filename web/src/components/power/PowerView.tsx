"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { LessonCard } from "@/components/classroom/LessonCard";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { CALCULATING, DATA_FAILED, powerAnswer, type LessonAnswer } from "@/lib/classroomAnswers";
import { useSiteData } from "@/lib/data/useSiteData";
import { DATA_END_MS } from "@/lib/dataRange";
import type { PowerRun } from "@/lib/power";
import {
  DEFAULT_SETUP,
  formatEnergy,
  formatSpan,
  LIMITS,
  lowestChargePct,
  MISSION_LENGTHS,
  powerHeadline,
  runPower,
  setupProblems,
  type NumberField,
  type PowerSetup,
  type SetupProblem,
} from "@/lib/powerPlan";
import { formatUtc, withQuery } from "@/lib/selection";
import { shortName } from "@/lib/sites";
import { PowerChart } from "./PowerChart";
import styles from "./power.module.css";

const DAY_MS = 86_400_000;
const DATA_END_YEAR = new Date(DATA_END_MS).getUTCFullYear();
const HINTS: Partial<Record<NumberField, string>> = { facingDeg: "0 = north, 90 = east", loadW: "always on" };

type Draft = Record<keyof PowerSetup, string>;

const toDraft = (setup: PowerSetup): Draft => Object.fromEntries(Object.entries(setup).map(([key, value]) => [key, String(value)])) as Draft;

function fromDraft(draft: Draft): PowerSetup {
  const number = (key: keyof PowerSetup) => (draft[key].trim() === "" ? Number.NaN : Number(draft[key]));
  return {
    areaM2: number("areaM2"),
    efficiencyPct: number("efficiencyPct"),
    mount: draft.mount === "vertical" ? "vertical" : "tracking",
    facingDeg: number("facingDeg"),
    capacityWh: number("capacityWh"),
    loadW: number("loadW"),
    startPct: number("startPct"),
    days: number("days"),
  };
}

interface FieldProps {
  name: NumberField;
  draft: Draft;
  problem: SetupProblem | undefined;
  onChange: (name: keyof PowerSetup, value: string) => void;
}

function NumberInput({ name, draft, problem, onChange }: FieldProps) {
  const { label, unit } = LIMITS.find(({ key }) => key === name)!;
  const errorId = `${name}-error`;
  const hint = HINTS[name];
  return (
    <label className={styles.field}>
      <span>
        {label}
        {hint && <small>, {hint}</small>}
      </span>
      <span className={styles.inputWrap}>
        <input
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? errorId : undefined}
          value={draft[name]}
          onChange={(event) => onChange(name, event.target.value)}
        />
        <em aria-hidden="true">{unit}</em>
      </span>
      {problem && (
        <span id={errorId} className={styles.fieldError}>
          {problem.message}
        </span>
      )}
    </label>
  );
}

function Results({ run, setup, landingMs, summary }: { run: PowerRun; setup: PowerSetup; landingMs: number; summary: string }) {
  return (
    <>
      <PowerChart samples={run.samples} capacityWh={setup.capacityWh} loadW={setup.loadW} emptyAtMs={run.emptyAtMs} days={setup.days} summary={summary} />
      <ul className={styles.legend}>
        <li className={styles.keySolar}>Solar power</li>
        <li className={styles.keyLoad}>Load</li>
        <li className={styles.keyCharge}>Battery charge</li>
        {run.emptyAtMs !== null && <li className={styles.keyEmpty}>Battery empty, {formatUtc(run.emptyAtMs)}</li>}
      </ul>
      <dl className={styles.stats}>
        <div>
          <dt>Lowest charge</dt>
          <dd data-testid="min-charge">{lowestChargePct(run.minSocWh, setup.capacityWh)}%</dd>
        </div>
        <div>
          <dt>From the panels</dt>
          <dd data-testid="generated">{formatEnergy(run.generatedWh)}</dd>
        </div>
        <div>
          <dt>Lost, battery already full</dt>
          <dd data-testid="wasted">{formatEnergy(run.wastedWh)}</dd>
        </div>
        <div>
          <dt>Load not supplied</dt>
          <dd data-testid="unmet">{formatEnergy(run.unmetWh)}</dd>
        </div>
        <div>
          <dt>Longest stretch below the load</dt>
          <dd data-testid="deficit">{formatSpan(run.longestDeficitHours)}</dd>
        </div>
      </dl>
      <p className={styles.note}>Mission from {formatUtc(landingMs)}, simulated every 10 minutes.</p>
    </>
  );
}

export function PowerView() {
  const { selection, query } = useSelection();
  const { site, timeMs } = selection;
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_SETUP));
  const setup = useMemo(() => fromDraft(draft), [draft]);
  const problems = setupProblems(setup);
  // the deferred value can lag a keystroke behind; an invalid form never shows the last result beside its errors
  const deferred = useDeferredValue(setup);
  const settled = problems.length === 0 && setupProblems(deferred).length === 0 ? deferred : null;
  const days = MISSION_LENGTHS.includes(setup.days) ? setup.days : DEFAULT_SETUP.days;

  const data = useSiteData({ site, startMs: timeMs, endMs: Math.min(timeMs + days * DAY_MS, DATA_END_MS) });
  const result = useMemo(
    () => (data.status === "ready" && settled ? runPower(data.ephemeris, site, data.profile, timeMs, settled) : null),
    [data, settled, site, timeMs],
  );
  const headline = result?.status === "ready" && settled ? powerHeadline(result.run, timeMs, settled.days) : null;
  const onChange = (name: keyof PowerSetup, value: string) => setDraft((current) => ({ ...current, [name]: value }));
  const problemFor = (name: keyof PowerSetup) => problems.find(({ key }) => key === name);
  const summary =
    headline && result?.status === "ready"
      ? `${headline.lead}${headline.emphasis} Lowest charge ${lowestChargePct(result.run.minSocWh, settled!.capacityWh)}%.`
      : "Solar power, load and battery charge across the mission";

  const lesson: LessonAnswer =
    problems.length > 0
      ? powerAnswer(null, null, false)
      : data.status === "error"
        ? DATA_FAILED
        : result?.status === "past-data"
          ? powerAnswer(null, null, true)
          : headline && result?.status === "ready" && settled
            ? powerAnswer(headline, lowestChargePct(result.run.minSocWh, settled.capacityWh), false)
            : CALCULATING;

  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Power and battery at {site.id === null ? "this custom site" : shortName(site)}</p>
        <h1>
          {headline ? (
            <>
              {headline.lead}
              <em className={headline.survives ? styles.good : styles.bad}>{headline.emphasis}</em>
            </>
          ) : (
            "Does the battery last?"
          )}
        </h1>
        <p className={styles.caveat}>
          For this exact point; ground nearby can differ. <Link href={withQuery("/ellipse", query)}>See the Landing Ellipse</Link>
        </p>
        {data.status === "ready" && !data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      </div>
      <LessonCard id="power" answer={lesson} />

      <div className={styles.layout}>
        <form className={styles.form} aria-label="Example lander" onSubmit={(event) => event.preventDefault()}>
          <fieldset>
            <legend>Solar panel</legend>
            <NumberInput name="areaM2" draft={draft} problem={problemFor("areaM2")} onChange={onChange} />
            <NumberInput name="efficiencyPct" draft={draft} problem={problemFor("efficiencyPct")} onChange={onChange} />
            <label className={styles.field}>
              <span>Mounting</span>
              <select aria-label="Mounting" value={draft.mount} onChange={(event) => onChange("mount", event.target.value)}>
                <option value="tracking">Turns to face the Sun</option>
                <option value="vertical">Fixed, vertical</option>
              </select>
            </label>
            {draft.mount === "vertical" && <NumberInput name="facingDeg" draft={draft} problem={problemFor("facingDeg")} onChange={onChange} />}
          </fieldset>
          <fieldset>
            <legend>Battery and load</legend>
            <NumberInput name="capacityWh" draft={draft} problem={problemFor("capacityWh")} onChange={onChange} />
            <NumberInput name="startPct" draft={draft} problem={problemFor("startPct")} onChange={onChange} />
            <NumberInput name="loadW" draft={draft} problem={problemFor("loadW")} onChange={onChange} />
            <label className={styles.field}>
              <span>Mission length</span>
              <select aria-label="Mission length" value={draft.days} onChange={(event) => onChange("days", event.target.value)}>
                {MISSION_LENGTHS.map((length) => (
                  <option key={length} value={length}>
                    {length} days
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <button type="button" className={styles.reset} onClick={() => setDraft(toDraft(DEFAULT_SETUP))}>
            Back to the example
          </button>
        </form>

        <section className={styles.results} aria-label="Results">
          {problems.length > 0 && (
            <p role="alert" className={styles.problems}>
              {problems.length === 1 ? "One value is" : `${problems.length} values are`} out of range: {problems.map(({ message }) => message).join(" ")}
            </p>
          )}
          {data.status === "loading" && problems.length === 0 && <p className={styles.note}>Calculating…</p>}
          {data.status === "error" && <DataNotice error={data.error} retry={data.retry} />}
          {result?.status === "past-data" && <p className={styles.note}>A mission this long from this date runs past our data, which ends in {DATA_END_YEAR}.</p>}
          {result?.status === "ready" && settled && <Results run={result.run} setup={settled} landingMs={timeMs} summary={summary} />}
          <p className={styles.limits}>
            Illustrative only. The example is a small lander of our own making, not any real mission, and its load is the same
            all the time. Not modelled: panel and battery temperature, heaters for the night, charging and wiring losses, dust,
            and the lander shading its own panels.
          </p>
        </section>
      </div>
    </>
  );
}

export function PowerViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Does the battery last?</h1>
      <p className={styles.caveat}>Calculating…</p>
    </div>
  );
}
