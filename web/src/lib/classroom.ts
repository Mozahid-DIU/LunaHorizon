/**
 * Classroom mode: one short lesson per page, in an order a class can follow, and plain meanings
 * for the words the pages use. Draft text by Team Astral; every number in an answer comes from
 * the page's own engine result (see classroomAnswers.ts), never from this file.
 */
import { isActivePage } from "./routes";

export type TermId = "golden" | "comms" | "dsn" | "skyline" | "earthset" | "polar-night" | "landing-zone" | "battery" | "jpl" | "lola";

export interface Term {
  word: string;
  meaning: string;
}

export const GLOSSARY: Record<TermId, Term> = {
  golden: {
    word: "Golden hours",
    meaning: "Hours when the Sun is above the site's skyline and Comms is open at the same time: power and a link to Earth together.",
  },
  comms: {
    word: "Comms",
    meaning: "Earth is above the site's skyline and at least one Deep Space Network dish has the Moon in view, so the lander can talk to Earth.",
  },
  dsn: {
    word: "DSN (Deep Space Network)",
    meaning: "NASA's three big radio dish stations, at Goldstone (California), Madrid (Spain) and Canberra (Australia). Spread around the Earth, so one of them can usually see the Moon.",
  },
  skyline: {
    word: "Skyline (horizon)",
    meaning: "Where the ground meets the sky, seen from the lander. Hills and crater rims raise it, so the Sun can set behind a ridge while it is still above flat ground.",
  },
  earthset: {
    word: "Earthset and Earthrise",
    meaning: "From the Moon's near side, Earth stays in nearly the same place in the sky; from the far side it is never seen. Near the poles it sits so low that it slowly sinks behind the skyline and later rises again.",
  },
  "polar-night": {
    word: "Lunar night",
    meaning: "A full Moon day, sunrise to sunrise, lasts about 29.5 Earth days, so near the equator a night lasts about two weeks. Near the poles it differs from place to place, because hills can hide the low Sun. With no sunlight, a lander lives on its battery.",
  },
  "landing-zone": {
    word: "Landing zone",
    meaning: "Landers rarely touch down exactly on target. The zone is the ground around the target where the lander could end up.",
  },
  battery: {
    word: "Wh (watt-hour)",
    meaning: "An amount of energy: 1 watt used for 1 hour. A 100 Wh battery can run a 10 W load for 10 hours.",
  },
  jpl: {
    word: "JPL Horizons",
    meaning: "NASA's Jet Propulsion Laboratory service that gives precise positions of the Sun, Moon, planets and spacecraft. Scientists use it as a reference.",
  },
  lola: {
    word: "LOLA",
    meaning: "The Lunar Orbiter Laser Altimeter on NASA's Lunar Reconnaissance Orbiter. It measured the height of the Moon's surface with laser pulses; our terrain comes from it.",
  },
};

export type LessonId = "atlas" | "sky" | "dates" | "power" | "compare" | "ellipse" | "3d" | "proof";

export interface Lesson {
  id: LessonId;
  href: string;
  page: string;
  idea: string;
  body: string;
  tryThis: string;
  question: string;
  terms: readonly TermId[];
}

export const LESSONS: readonly Lesson[] = [
  {
    id: "atlas",
    href: "/",
    page: "Atlas",
    idea: "The Moon's south pole has its best light.",
    body: "Near the pole the Sun never climbs high; it circles around the horizon. High crater rims can stay in sunlight for most of the year, while deep crater floors may never see the Sun at all.",
    tryThis: "Switch the map between Golden, Sunlight and Earth view. Watch where the bright patches move.",
    question: "What share of all hours from 2026 to 2030 does the Sun shine on the chosen site?",
    terms: ["golden", "skyline"],
  },
  {
    id: "sky",
    href: "/sky",
    page: "Sky",
    idea: "On the Moon, a hill can steal the sunset.",
    body: "Near the south pole the Sun slides along the horizon for days. Even a small ridge can hide it, and a solar-powered lander goes dark.",
    tryThis: "Press \"Play the next 14 days\" under the sky picture and watch the Sun move along the skyline. Does it ever drop behind the hills?",
    question: "Of the first 336 hours after landing here, how many have sunlight?",
    terms: ["skyline", "earthset", "dsn", "golden"],
  },
  {
    id: "dates",
    href: "/dates",
    page: "Dates",
    idea: "When you land matters as much as where.",
    body: "The same spot can be sunny for a whole mission or sink into night after a few days. Moving the landing by a week or two can change everything.",
    tryThis: "Press \"Use this date\" on another date in the list. Watch how the Golden hours change for the same site.",
    question: "Which landing date, in the 12 months from the chosen date, gives this site the most Golden hours?",
    terms: ["golden", "comms"],
  },
  {
    id: "power",
    href: "/power",
    page: "Power",
    idea: "Sunlight is power, and the night drains the battery.",
    body: "A lander charges its battery while the Sun is up and lives on it when the Sun is hidden. If a dark stretch lasts too long, the battery runs empty.",
    tryThis: "Make the battery smaller, or the mission longer. Find the point where the lander no longer survives.",
    question: "With the lander on this page, does the battery last the whole mission?",
    terms: ["battery", "polar-night"],
  },
  {
    id: "compare",
    href: "/compare",
    page: "Compare",
    idea: "A few kilometres can make a big difference.",
    body: "Two sites close together can see very different skies, because each has its own hills around it. Comparing side by side shows which one keeps the Sun and Earth longest.",
    tryThis: "Add a second site or a different date, and see which column wins.",
    question: "Which column on this page gets the most Golden hours?",
    terms: ["golden", "comms"],
  },
  {
    id: "ellipse",
    href: "/ellipse",
    page: "Ellipse",
    idea: "Landers miss their target.",
    body: "Even a careful landing can end up hundreds of metres away. Teams check the ground all around the target, not just one point.",
    tryThis: "Switch between the 100 m, 500 m and 1 km zones. Do the best and worst points change?",
    question: "Within 1 km of the target, how many Golden hours separate the best point from the worst?",
    terms: ["landing-zone", "golden"],
  },
  {
    id: "3d",
    href: "/3d",
    page: "3D",
    idea: "On the Moon, shadows are black.",
    body: "There is no air to scatter light, so ground in shadow gets almost no light at all. Long shadows from hills sweep across the land as the Sun moves.",
    tryThis: "Switch to Lander's eye and turn on Skyline check. Press Play and watch the shadows move.",
    question: "At the moment shown, how high is the skyline in the Sun's direction, and is the Sun above it?",
    terms: ["skyline", "lola"],
  },
  {
    id: "proof",
    href: "/proof",
    page: "Proof",
    idea: "Good science checks its numbers.",
    body: "We compare our Sun and Earth positions with NASA JPL Horizons, a trusted reference, and our terrain results with published studies.",
    tryThis: "Open \"See all checks\" in one section. Compare our value with the reference value in one row.",
    question: "What is the largest angle difference between our numbers and the references?",
    terms: ["jpl", "lola"],
  },
];

/** The lesson for a page, or null on pages without one (the Mission Brief, a replay). */
export function lessonFor(pathname: string): Lesson | null {
  return LESSONS.find(({ href }) => isActivePage(pathname, href)) ?? null;
}

export function findLesson(id: LessonId): Lesson {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new RangeError(`no lesson ${id}`);
  return lesson;
}

export function lessonNeighbours(id: LessonId): { number: number; previous: Lesson | null; next: Lesson | null } {
  const index = LESSONS.findIndex((l) => l.id === id);
  if (index < 0) throw new RangeError(`no lesson ${id}`);
  return { number: index + 1, previous: LESSONS[index - 1] ?? null, next: LESSONS[index + 1] ?? null };
}
