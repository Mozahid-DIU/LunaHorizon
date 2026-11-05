import { alternatives, briefStamp, againstMission, type Evidence, type WatchItem } from "@/lib/brief";
import { formatChange, formatPercent } from "@/lib/datesPlan";
import type { Relay } from "@/lib/dsnRelay";
import type { ZoneSummary } from "@/lib/ellipse";
import { pointName } from "@/lib/ellipse";
import { nudgeHeadline, type NudgePlan } from "@/lib/nudgePlan";
import type { BestDate } from "@/lib/planning";
import type { PowerRun } from "@/lib/power";
import { DEFAULT_SETUP, lowestChargePct, powerHeadline } from "@/lib/powerPlan";
import { ELEVATION_MASK_DEG } from "@/lib/dsnRelay";
import { DIRECTIONS, NUDGE_KM } from "@/lib/nudgePlan";
import { formatUtc } from "@/lib/selection";
import { formatCoordinates, formatDuration, MISSION_DAYS, type BodyOutlook, type SiteSummary } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import { axisPercent, formatHours, TIMELINE_DAYS, type TimelineRow } from "@/lib/timeline";
import type { SiteState } from "@/lib/windows";
import styles from "./brief.module.css";
import { BriefQr } from "./BriefQr";
import { BriefSky } from "./BriefSky";

const ROW_NAMES: Record<TimelineRow["kind"], string> = { lit: "Sun", earth: "Earth", dsn: "DSN", comms: "Comms", golden: "Golden" };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassWord = (az: number) => COMPASS[Math.round(az / 45) % 8];
const degrees = (value: number) => {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return `${value < 0 && rounded > 0 ? "−" : ""}${rounded.toFixed(1)}°`;
};

/** Where the terrain behind the horizon comes from, as the horizon file names it. */
function terrainText(data: BriefData): string {
  if (!data.hasTerrain) return "flat horizon, terrain not included";
  if (data.isFromTiles) return "NASA LOLA height tiles, horizon computed in your browser";
  return data.terrainSource ?? "NASA LRO LOLA terrain";
}

/** A part of the brief still being worked out, or one that has nothing to say here. */
export type Part<T> = { state: "ready"; value: T } | { state: "pending" } | { state: "none"; why: string } | { state: "failed"; why: string };

function PartNote<T>({ part }: { part: Part<T> }) {
  if (part.state === "pending") return <p className={styles.note}>Calculating…</p>;
  if (part.state === "ready") return null;
  return <p className={styles.note}>{part.why}</p>;
}

export interface BriefData {
  site: SelectedSite;
  landingMs: number;
  url: string;
  preparedMs: number | null;
  summary: SiteSummary;
  state: SiteState;
  rows: TimelineRow[];
  relay: Relay;
  profile: readonly number[];
  sunPath: readonly (readonly [number, number])[];
  hasTerrain: boolean;
  isFromTiles: boolean;
  /** The map a curated site's horizon file names; null for a custom point or until it loads. */
  terrainSource: string | null;
  isFarSide: boolean;
  isCoarse: boolean;
  cutMs: number | null;
  dataEndText: string;
  power: Part<PowerRun>;
  zone: Part<ZoneSummary>;
  nudge: Part<NudgePlan>;
  best: Part<{ best: BestDate[]; isSearchCut: boolean }>;
  watch: WatchItem[];
  evidence: Part<Evidence>;
}

function Header({ data, page, kicker }: { data: BriefData; page: number; kicker: string }) {
  return (
    <header className={styles.head}>
      <div>
        <p className={styles.brand}>
          Luna<b>Horizon</b>
        </p>
        <p className={styles.kicker}>Mission Brief · {kicker}</p>
      </div>
      <div className={styles.meta}>
        {page === 1 && <BriefQr url={data.url} />}
        {page === 1 ? (
          <span className={styles.metaUrl}>{data.url.replace(/^https?:\/\//, "")}</span>
        ) : (
          <span>
            {shortName(data.site)} · {formatUtc(data.landingMs).split(",")[0]}
          </span>
        )}
        <span>
          {data.preparedMs !== null && `Prepared ${formatUtc(data.preparedMs).split(",")[0]} · `}Page <b>{page}</b> of 2
        </span>
      </div>
    </header>
  );
}

function eventCell(name: string, outlook: BodyOutlook, rises: string, sets: string, landingMs: number, isSearchCut: boolean) {
  const label = `${outlook.isUp ? sets : rises} in`;
  if (outlook.eventMs === null) {
    const span = isSearchCut ? "as far as our data goes" : "for at least 60 days";
    return { label, value: isSearchCut ? "Beyond our data" : "Not in 60 days", note: `${name} ${outlook.isUp ? "stays up" : "stays down"} ${span}` };
  }
  return { label, value: formatDuration(outlook.eventMs - landingMs), note: againstMission(outlook.eventMs, landingMs) };
}

function Verdict({ data }: { data: BriefData }) {
  const { summary, landingMs } = data;
  const earth = eventCell("Earth", summary.earth, "Earthrise", "Earthset", landingMs, summary.isSearchCut);
  const sun = eventCell("The Sun", summary.sun, "Sunrise", "Sunset", landingMs, summary.isSearchCut);
  return (
    <div className={styles.verdict} data-testid="brief-verdict">
      <div className={styles.verdictMain}>
        <p>Golden hours</p>
        <strong data-testid="brief-golden">
          {summary.hours.golden > 0 && summary.hours.golden < 1 ? "under 1" : Math.floor(summary.hours.golden)} of {MISSION_DAYS * 24}
        </strong>
        <small>The Sun&apos;s centre and Earth both above the skyline, and a DSN station listening, during the {MISSION_DAYS}-day mission</small>
      </div>
      <div>
        <p>Landing</p>
        <strong className={styles.verdictDate}>{formatUtc(landingMs).split(",")[0]}</strong>
        <small>{formatUtc(landingMs).split(", ")[1]}</small>
      </div>
      {[earth, sun].map(({ label, value, note }) => (
        <div key={label}>
          <p>{label}</p>
          <strong>{value}</strong>
          <small>{note}</small>
        </div>
      ))}
    </div>
  );
}

function Timeline({ data }: { data: BriefData }) {
  const at = (ms: number) => axisPercent(ms, data.landingMs);
  return (
    <div className={styles.timeline}>
      <div className={styles.tlRows}>
        {data.rows.map((row) => (
          <div className={styles.tlRow} key={row.kind} data-kind={row.kind}>
            <span className={styles.tlName}>{ROW_NAMES[row.kind]}</span>
            <span className={styles.tlTrack}>
              {row.windows.map(({ start, end }) => (
                <i key={start} style={{ left: `${at(start)}%`, width: `${at(end) - at(start)}%` }} />
              ))}
              <b className={styles.tlMission} style={{ width: `${(MISSION_DAYS / TIMELINE_DAYS) * 100}%` }} aria-hidden="true" />
              {data.cutMs !== null && <b className={styles.tlCut} style={{ left: `${at(data.cutMs)}%` }} aria-hidden="true" />}
            </span>
            <span className={styles.tlHours}>{formatHours(row.hours)}</span>
          </div>
        ))}
      </div>
      <div className={styles.tlAxis} aria-hidden="true">
        {[0, 7, 14, 21, 28].map((day) => (
          <span key={day} style={{ left: `${(day / TIMELINE_DAYS) * 100}%` }}>
            {day === 0 ? formatUtc(data.landingMs).split(",")[0] : `+${day} d`}
          </span>
        ))}
      </div>
      <p className={styles.note}>
        The dashed frame is the {MISSION_DAYS}-day mission; the rest shows what follows it.
        {data.cutMs !== null && ` Our data ends on ${data.dataEndText} (red line); nothing is shown after it.`}
      </p>
    </div>
  );
}

function AtLanding({ data }: { data: BriefData }) {
  const { state, relay } = data;
  const listening = relay.lanes.filter(({ station }) => (state.dsnMask >> station.bit) & 1).map(({ station }) => station.place);
  return (
    <div>
      <h2 className={styles.h3}>At landing</h2>
      <dl className={styles.kv}>
        <dt>Sun</dt>
        <dd>
          <b>{degrees(state.sun.el)}</b>, {compassWord(state.sun.az)} ({Math.round(state.sun.az) % 360}°); skyline there {degrees(state.sun.horizon)}
        </dd>
        <dt>Earth</dt>
        <dd>
          <b>{degrees(state.earth.el)}</b>, {compassWord(state.earth.az)} ({Math.round(state.earth.az) % 360}°); skyline there {degrees(state.earth.horizon)}
        </dd>
        <dt>Status</dt>
        <dd className={state.golden ? styles.good : undefined}>
          <b>{state.golden ? "Golden window open" : !state.lit ? "Sun below the skyline" : !state.earthVisible ? "Earth below the skyline" : "No DSN station listening"}</b>
        </dd>
        <dt>DSN</dt>
        <dd>{listening.length > 0 ? `${listening.join(" and ")} listening` : "No station listening"}</dd>
      </dl>
      <h2 className={styles.h3}>
        Who on Earth can hear it <span>next {Math.floor(relay.totalHours / 24)} days</span>
      </h2>
      <div className={styles.stations}>
        {relay.lanes.map(({ station, hours }) => (
          <div key={station.bit} className={styles.station}>
            <span>{station.place}</span>
            <i>
              <b style={{ width: `${(hours / relay.totalHours) * 100}%` }} />
            </i>
            <em>{Math.floor((hours / relay.totalHours) * 100)}%</em>
          </div>
        ))}
      </div>
      <p className={styles.note}>
        {relay.gaps.length === 0 ? (
          <>In these {Math.floor(relay.totalHours / 24)} days a station always listens.</>
        ) : (
          <>
            No station listens for <b>{formatHours(relay.gapHours)} of {Math.floor(relay.totalHours)} h</b>. Shares are rounded down; two stations often listen at once.
          </>
        )}
      </p>
    </div>
  );
}

function OffTarget({ zone }: { zone: Part<ZoneSummary> }) {
  return (
    <section className={styles.sec}>
      <h2 className={styles.h3}>
        If the landing is off target <span>{zone.state === "ready" ? `points within ${zone.value.ringM} m, each with its own horizon` : "nearby points, each with its own horizon"}</span>
      </h2>
      <PartNote part={zone} />
      {zone.state === "ready" && (
        <>
          <div className={styles.ring} data-testid="brief-zone">
            {(
              [
                ["On target", zone.value.target, "the planned point"],
                ["Best", zone.value.best, pointName(zone.value.best.point)],
                ["Median", zone.value.median, pointName(zone.value.median.point)],
                ["Worst", zone.value.worst, pointName(zone.value.worst.point)],
              ] as const
            ).map(([label, item, where]) => (
              <div key={label} className={label === "Worst" && item.score.goldenHours < zone.value.target.score.goldenHours ? styles.bad : undefined} data-testid={`zone-${label.toLowerCase().replace(" ", "-")}`}>
                <p>{label}</p>
                <strong>{formatHours(item.score.goldenHours)}</strong>
                <small>{where}</small>
              </div>
            ))}
          </div>
          <p className={styles.note}>
            {zone.value.count} sample points: the target and 8 on each ring out to {zone.value.ringM} m. The median is the middle of these points, not the likeliest
            spot.
          </p>
        </>
      )}
    </section>
  );
}

export function PageOne({ data }: { data: BriefData }) {
  return (
    <section className={styles.sheet} aria-label="Mission Brief, page 1">
      <Header data={data} page={1} kicker="landing site and window" />
      <div className={styles.titleRow}>
        <h1 className={styles.site}>{shortName(data.site)}</h1>
        <p className={`${styles.stamp} ${data.summary.hours.golden < 1 / 60 ? styles.stampNone : ""}`} data-testid="brief-stamp">
          {briefStamp(data.summary.hours.golden)}
        </p>
      </div>
      <p className={styles.where} data-testid="brief-where">
        <b>{formatCoordinates(data.site.lat, data.site.lon)}</b>
        {data.site.name.includes("(") ? ` · ${data.site.name.slice(data.site.name.indexOf("(") + 1, data.site.name.lastIndexOf(")"))}` : ""} · {terrainText(data)} · lander eye 2 m above
        ground
      </p>
      {data.isFarSide && (
        <p className={styles.caveat}>
          Earth never rises at this site, so direct contact with Earth is impossible and there are no Golden hours. Landers on the far side
          talk to Earth through a relay satellite in lunar orbit, which our Comms rule does not include.
        </p>
      )}
      {data.isCoarse && (
        <p className={styles.caveat}>
          The ground near this site comes from NASA&apos;s global LOLA map, whose pixels are 237 m wide, so close slopes are smoothed. At Apollo
          11, the one place we could compare it with a finer map, the two skylines differed by up to about 2°, mostly from ground within 1 km.
        </p>
      )}
      <Verdict data={data} />
      <section className={styles.sec}>
        <h2 className={styles.h3}>
          {TIMELINE_DAYS}-day timeline <span>from the landing</span>
        </h2>
        <Timeline data={data} />
      </section>
      <section className={`${styles.sec} ${styles.two}`}>
        <div>
          <h2 className={styles.h3}>Sky from the lander</h2>
          <BriefSky profile={data.profile} sunPath={data.sunPath} sun={data.state.sun} earth={data.state.earth} isSunUp={data.state.lit} isEarthUp={data.state.earthVisible} />
        </div>
        <AtLanding data={data} />
      </section>
      <OffTarget zone={data.zone} />
      <footer className={styles.foot}>
        <span>LunaHorizon · NASA Space Apps 2026 · Team Astral</span>
        <span>Every number from the engine; positions checked against NASA JPL Horizons</span>
      </footer>
    </section>
  );
}

function SmallChange({ nudge }: { nudge: Part<NudgePlan> }) {
  if (nudge.state !== "ready") {
    return (
      <div>
        <h2 className={styles.h3}>Small change, big impact</h2>
        <PartNote part={nudge} />
      </div>
    );
  }
  const plan = nudge.value;
  const { lead, emphasis, tail, isLoss } = nudgeHeadline(plan);
  const worst = [...plan.moved].sort((a, b) => a.goldenHours - b.goldenHours).slice(0, 4);
  return (
    <div data-testid="brief-nudge">
      <h2 className={styles.h3}>Small change, big impact</h2>
      <p className={styles.lede}>
        {lead}
        <b className={isLoss ? styles.badText : styles.good}>{emphasis}</b>
        {tail}
      </p>
      <dl className={styles.kv}>
        {worst.map((m) => (
          <div key={`${m.km}${m.letter}`} className={styles.kvRow}>
            <dt>
              {m.km} km {m.letter}
            </dt>
            <dd>
              {formatHours(m.goldenHours)} <span className={styles.mono}>{formatChange(m.goldenHours, plan.chosenHours)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        The four lowest of {plan.moved.length} points {NUDGE_KM.join(" km and ")} km away in {DIRECTIONS.length} directions; each has its own horizon from NASA LOLA height tiles.
      </p>
    </div>
  );
}

function Power({ power, landingMs }: { power: Part<PowerRun>; landingMs: number }) {
  return (
    <div data-testid="brief-power">
      <h2 className={styles.h3}>Power, example lander</h2>
      <PartNote part={power} />
      {power.state === "ready" && (
        <>
          <p className={styles.lede}>
            <b className={power.value.emptyAtMs === null ? styles.good : styles.badText}>
              {powerHeadline(power.value, landingMs, MISSION_DAYS).lead}
              {powerHeadline(power.value, landingMs, MISSION_DAYS).emphasis}
            </b>{" "}
            {power.value.emptyAtMs === null && `The battery never drops below ${lowestChargePct(power.value.minSocWh, DEFAULT_SETUP.capacityWh)}%.`}
          </p>
          <dl className={styles.kv}>
            <dt>Panel</dt>
            <dd>
              {DEFAULT_SETUP.areaM2} m², {DEFAULT_SETUP.efficiencyPct}%, {DEFAULT_SETUP.mount === "tracking" ? "Sun-tracking" : "vertical"}
            </dd>
            <dt>Battery</dt>
            <dd>
              {DEFAULT_SETUP.capacityWh.toLocaleString("en-GB")} Wh, {DEFAULT_SETUP.loadW} W load
            </dd>
            <dt>Longest shortfall</dt>
            <dd>{power.value.longestDeficitHours > 0 ? formatHours(power.value.longestDeficitHours) : "None"}</dd>
          </dl>
          <p className={styles.note}>Example values; heating, charging losses and dust are not modelled.</p>
        </>
      )}
    </div>
  );
}

function Watch({ items, isWaiting }: { items: WatchItem[]; isWaiting: boolean }) {
  return (
    <section className={styles.sec}>
      <h2 className={styles.h3}>What to watch</h2>
      <ol className={styles.watch} data-testid="brief-watch">
        {items.map(({ isRisk, title, text }, i) => (
          <li key={title} className={isRisk ? styles.risk : undefined}>
            <span className={styles.watchNumber} aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <em className={styles.watchKind}>{isRisk ? "Risk" : "Note"}</em> <b>{title}.</b> {text}
            </span>
          </li>
        ))}
      </ol>
      {isWaiting && <p className={styles.note}>More notes appear as the remaining calculations finish.</p>}
    </section>
  );
}

function BetterDates({ best, landingMs, chosenHours, dataEndText }: { best: BriefData["best"]; landingMs: number; chosenHours: number; dataEndText: string }) {
  const list = best.state === "ready" ? alternatives(best.value.best, landingMs).filter(({ score }) => score.goldenHours >= 1 / 60) : [];
  const isCut = best.state === "ready" && best.value.isSearchCut;
  return (
    <section className={styles.sec}>
      <h2 className={styles.h3}>
        Other landings in the 12 months after this one <span>same site, {MISSION_DAYS}-day missions</span>
      </h2>
      <PartNote part={best} />
      {best.state === "ready" && list.length === 0 && <p className={styles.note}>No other landing in this search, at least {MISSION_DAYS} days apart, has any Golden hours.</p>}
      {best.state === "ready" && list.length > 0 && (
        <table className={styles.dates} data-testid="brief-dates">
          <caption className={styles.srOnly}>Other landings and their Golden hours against this landing</caption>
          <thead>
            <tr>
              <th scope="col">Landing</th>
              <th scope="col">Golden</th>
              <th scope="col">Against this landing</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ landingMs: at, score }) => {
              const percent = chosenHours > 0 ? formatPercent((100 * (score.goldenHours - chosenHours)) / chosenHours) : null;
              return (
                <tr key={at}>
                  <td>{formatUtc(at)}</td>
                  <td>{formatHours(score.goldenHours)}</td>
                  <td>
                    {formatChange(score.goldenHours, chosenHours)}
                    {percent && ` (${percent})`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {best.state === "ready" && (
        <p className={styles.note}>
          The best of the search, at least {MISSION_DAYS} days apart so each is a separate chance.{isCut && ` The search stops where our data ends, on ${dataEndText}.`}
        </p>
      )}
    </section>
  );
}

export function PageTwo({ data, isWaiting }: { data: BriefData; isWaiting: boolean }) {
  const { evidence } = data;
  return (
    <section className={styles.sheet} aria-label="Mission Brief, page 2">
      <Header data={data} page={2} kicker="risks and evidence" />
      <h1 className={styles.srOnly}>Risks and evidence for {shortName(data.site)}</h1>
      <section className={`${styles.sec} ${styles.two}`}>
        <SmallChange nudge={data.nudge} />
        <Power power={data.power} landingMs={data.landingMs} />
      </section>
      <Watch items={data.watch} isWaiting={isWaiting} />
      <BetterDates best={data.best} landingMs={data.landingMs} chosenHours={data.summary.hours.golden} dataEndText={data.dataEndText} />
      <section className={styles.sec}>
        <h2 className={styles.h3}>Evidence</h2>
        <PartNote part={evidence} />
        {evidence.state === "ready" && (
          <div className={styles.proof} data-testid="brief-evidence">
            <strong>
              {evidence.value.passed} / {evidence.value.checks}
            </strong>
            <p>
              validation checks pass. Sun, Earth and Moon positions match NASA JPL Horizons and full SPICE to under {evidence.value.maxAngleDeg}°. Our reading
              of the LOLA maps agrees with the heights LROC published at {evidence.value.heightsPassed} of {evidence.value.heightChecks} landing and impact sites,
              within {evidence.value.maxHeightDiffM} m (limit {evidence.value.heightToleranceM} m); LROC&apos;s maps are also built from LOLA, so this checks our reading, not
              the maps. The full table is on the Proof page.
            </p>
          </div>
        )}
      </section>
      <section className={styles.sec}>
        <h2 className={styles.h3}>Data and method</h2>
        <ol className={styles.sources}>
          <li>Terrain: {terrainText(data)}</li>
          <li>Sun, Earth and Moon: NASA JPL DE440 ephemeris, through Skyfield and SPICE</li>
          <li>DSN: Goldstone, Madrid and Canberra, counted while the Moon is at least {ELEVATION_MASK_DEG}° above each</li>
          <li>Golden: the Sun&apos;s centre above the skyline, Earth above the skyline, and a DSN station listening</li>
          <li>{data.hasTerrain ? "Horizon: 360 directions out to 150 km, from 2 m above the ground" : "Horizon: flat, so terrain is not included at this point"}</li>
          <li>Site: {data.site.id === null ? "a point you chose" : <>{shortName(data.site)}; source {data.site.source.replace(/^https?:\/\//, "")}</>}</li>
        </ol>
      </section>
      <footer className={styles.foot}>
        <span>Open the live version for any other site or date: {data.url.replace(/^https?:\/\//, "").split("/")[0]}</span>
        <span>Every number comes from the engine; no AI wrote them</span>
      </footer>
    </section>
  );
}
