/**
 * Ask LunaHorizon: questions about the chosen landing and about how the app works. The answers
 * come from two places only: the engine's figures for this landing (InsightFacts), and the
 * notes below, which we wrote. An AI may put them into words; it never computes, and an answer
 * that holds any figure from neither place is not shown. Without the AI, the suggested
 * questions are answered by fixed rules from the same two places.
 */
import { GUIDE } from "./askGuide";
import { DEFAULT_SEARCH_MS } from "./countdown";
import { ELEVATION_MASK_DEG } from "./dsnRelay";
import { factLines, limitSentence, nextChange, NUMBER_WORDS, OTHER_DIGITS, quantities, ruleInsight, siteName, type InsightFacts } from "./insight";
import { formatUtc } from "./selection";
import { MISSION_DAYS } from "./siteSummary";
import { formatHours } from "./timeline";

export const MAX_QUESTION_CHARS = 300;
/** The characters an answer may use: English letters, digits, plain punctuation and the degree sign. */
const PLAIN = /^[A-Za-z0-9 .,;:'"()%°\-–—/?!&]*$/;
/** How many earlier questions are sent with a new one, so a follow-up can be understood. */
export const MAX_HISTORY = 3;
/** Questions that try to change the AI's rules are not sent to it. */
const STEERING = /\b(ignore|disregard|forget|pretend|role ?play|you are now|act as|system prompt|instructions?|repeat after|say that|say exactly|write exactly|jailbreak|override)\b/i;
const SEARCH_DAYS = DEFAULT_SEARCH_MS / 86_400_000;
const SAME_HOURS = 1 / 60;

/** What we tell the AI about the app, and what the rule answers draw on. Every figure here is ours. */
export const NOTES: readonly string[] = [
  `A Golden hour is an hour when the Sun is above the skyline (its centre), Earth is above the skyline, and a DSN station has the Moon at least ${ELEVATION_MASK_DEG}° up, all at once: power and a link home together.`,
  `The Deep Space Network (DSN) is NASA's set of big antenna sites at Goldstone in the USA, Madrid in Spain and Canberra in Australia. They are spread around the world, so often a station has the Moon at least ${ELEVATION_MASK_DEG}° up, but not always.`,
  "The skyline is the real horizon around the site, worked out from NASA's LOLA elevation maps of the Moon, seen from 2 m above the ground, in 360 directions out to 150 km.",
  "Sun and Earth positions come from NASA JPL's DE440 ephemeris, through Skyfield and SPICE. Near the south pole the terrain comes from NASA LOLA polar maps; at some sites near the equator from SLDEM2015, made from NASA LOLA and JAXA Kaguya data; elsewhere from LOLA's global map, whose 237 m pixels smooth slopes close to the site.",
  "Our positions are checked against NASA JPL Horizons, and every check and its difference is listed on the Proof page.",
  `A mission here lasts ${MISSION_DAYS} days. Our data covers 2026 to 2030.`,
  "Near the south pole the Sun stays low, so a small hill can hide it; moving the landing a little, or landing a day later, can change the result a lot. The Dates page shows this, and the Ellipse page shows ground near the target.",
  "LunaHorizon's numbers come from its own engine. The AI only puts them into words; it does not compute anything.",
];

export interface Topic {
  id: string;
  /** The question as a suggestion chip shows it. */
  question: string;
  /** Words that point a typed question at this topic. */
  keywords: readonly string[];
  answer: (facts: InsightFacts) => string;
}

const goldenAnswer = (facts: InsightFacts) =>
  `${NOTES[0]} At ${siteName(facts)}, landing on ${formatUtc(facts.landingMs)}, the ${MISSION_DAYS}-day mission gets ${facts.goldenHours < SAME_HOURS ? "no Golden hours" : formatHours(facts.goldenHours)} of them.`;

export const TOPICS: readonly Topic[] = [
  { id: "summary", question: "Is this a good landing?", keywords: ["good", "summary", "overall", "landing", "explain"], answer: ruleInsight },
  { id: "golden", question: "What does Golden mean?", keywords: ["golden", "mean", "meaning", "definition"], answer: goldenAnswer },
  {
    id: "limit",
    question: "What limits the Golden hours?",
    keywords: ["limit", "limits", "why", "short", "less", "reduce"],
    answer: (facts) => (facts.goldenHours < SAME_HOURS ? ruleInsight(facts) : limitSentence(facts)),
  },
  {
    id: "earth",
    question: "When does Earth set or rise?",
    keywords: ["earth", "earthset", "earthrise", "contact", "call home", "link"],
    answer: (facts) => nextChange("Earth", { isUp: facts.earthUp, eventMs: facts.earthEventMs }, facts.landingMs, facts.isSearchCut),
  },
  {
    id: "sun",
    question: "When does the Sun set or rise?",
    keywords: ["sun", "sunset", "sunrise", "night", "dark", "power", "light"],
    answer: (facts) => nextChange("the Sun", { isUp: facts.sunUp, eventMs: facts.sunEventMs }, facts.landingMs, facts.isSearchCut),
  },
  { id: "dsn", question: "What is the DSN?", keywords: ["dsn", "deep space", "station", "goldstone", "madrid", "canberra", "antenna"], answer: () => NOTES[1] },
  {
    id: "terrain",
    question: "Is the terrain included?",
    keywords: ["terrain", "hill", "hills", "skyline", "horizon", "crater", "flat"],
    answer: (facts) => (facts.hasTerrain ? NOTES[2] : "No: this point has no terrain, so the horizon is flat and hills that could block the Sun or Earth are not included."),
  },
  { id: "data", question: "Where does the data come from?", keywords: ["data", "source", "nasa", "lola", "ephemeris", "jaxa", "kaguya"], answer: () => `${NOTES[3]} ${NOTES[2]}` },
  { id: "accuracy", question: "How accurate is it?", keywords: ["accurate", "accuracy", "trust", "check", "checked", "proof", "valid", "correct"], answer: () => NOTES[4] },
  { id: "ai", question: "Does the AI compute anything?", keywords: ["ai", "model", "chatgpt", "llm", "groq"], answer: () => NOTES[7] },
];

/**
 * Typographic look-alikes an AI model often writes (curly quotes, non-breaking hyphens and
 * spaces, an ellipsis) turned into their plain forms. None of them is part of a number, so the
 * figures in the text are unchanged; everything else unusual is still refused by the check.
 */
export function plainPunctuation(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒]/g, "-")
    .replace(/[    ]/g, " ")
    .replace(/…/g, "...");
}

const SMALL_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const SMALL_NUMBERS = new RegExp(`\\b(${SMALL_WORDS.join("|")})\\b`, "gi");

/** Every text an answer may take its figures from, for this landing. */
export function sourceTexts(facts: InsightFacts): string[] {
  return [ruleInsight(facts), ...factLines(facts), ...NOTES, ...TOPICS.map((topic) => topic.answer(facts)), `within ${SEARCH_DAYS} days`, ...GUIDE];
}

/** Figures in `text` that neither the engine's facts nor our notes give; empty means it may be shown. */
export function strayInAnswer(text: string, facts: InsightFacts): string[] {
  const allowed = new Set(sourceTexts(facts).flatMap(quantities));
  // only plain English in plain characters is checked well enough to show: other scripts,
  // numerals and invisible characters are refused, not repaired
  const normal = text.normalize("NFKC");
  const odd = normal === text && PLAIN.test(text) ? [] : ["unexpected characters"];
  const links = /:\/\/|\bwww\./i.test(text) ? ["a link"] : [];
  // "three" is checked as 3, so it passes only where 3 itself would; every other number word is refused
  const counted = text.replace(SMALL_NUMBERS, (word) => String(SMALL_WORDS.indexOf(word.toLowerCase())));
  const words = (counted.match(NUMBER_WORDS) ?? []).map((word) => word.toLowerCase());
  const digits = text.match(OTHER_DIGITS) ?? [];
  return [...new Set([...odd, ...links, ...quantities(counted).filter((quantity) => !allowed.has(quantity)), ...words, ...digits])];
}

/** The topic a typed question is about, by its words; null when nothing fits well enough. */
export function topicFor(question: string): Topic | null {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  let best: { topic: Topic; score: number } | null = null;
  for (const topic of TOPICS) {
    const score = topic.keywords.filter((word) => text.includes(` ${word} `)).length;
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

/** A question as a person typed it: trimmed, control characters out, within the limit. */
export function parseQuestion(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("the question is not text");
  // control characters and the prompt's own markers are taken out, so a question cannot close its quote
  const question = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<{2,}|>{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (question.length === 0) throw new Error("the question is empty");
  if (question.length > MAX_QUESTION_CHARS) throw new Error("the question is too long");
  return question;
}

/**
 * The visitor's earlier questions, as the browser sent them. Only questions are taken, never
 * earlier answers, because a browser could forge an answer in LunaHorizon's own voice. A badly
 * formed list refuses the request; a question that breaks the rules for a new one is left out.
 */
export function parseHistory(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY || !raw.every((item) => typeof item === "string")) throw new Error("the history is not a short list of text");
  return raw.flatMap((item: string) => {
    try {
      const question = parseQuestion(item);
      return isSteering(question) ? [] : [question];
    } catch {
      return [];
    }
  });
}

/** Whether a question asks the AI to drop or change its rules; such questions get rule answers only. */
export const isSteering = (question: string): boolean => STEERING.test(question);
