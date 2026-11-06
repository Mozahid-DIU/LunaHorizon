/**
 * The server side of the insight: checks the facts, asks the AI to put them into words, and
 * shows its answer only if every number in it came from our engine. It never runs in a browser,
 * because it holds the API key.
 */
import { factLines, parseFacts, strayNumbers, type InsightFacts } from "./insight";

export const AI_MODEL = "openai/gpt-oss-120b";
export const MAX_BODY_CHARS = 2_000;
export const CLIENT_PER_MINUTE = 5;
const CLIENT_PER_DAY = 40;
/** Groq's free plan allows 1,000 requests a day; this keeps headroom for the demo. */
const ALL_PER_DAY = 800;
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const TIMEOUT_MS = 12_000;
const MAX_TOKENS = 700;
const MAX_CACHED = 300;
const MAX_CLIENTS = 5_000;
const MIN_TEXT = 40;
const MAX_TEXT = 1_200;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const SYSTEM = [
  "You explain lunar landing results that LunaHorizon's engine has already computed.",
  "You never calculate, estimate, round or convert anything.",
  "Copy every number exactly as it is written in the facts, and write no other number, not even in words.",
  "Say nothing the facts do not state: not whether sunlight or contact is continuous, not why, and give no advice.",
  "Write plain English for a general audience, in 3 or 4 short sentences, with no lists, headings or markdown.",
].join(" ");

export type FallbackReason = "off" | "busy" | "failed" | "checked" | "invalid" | "declined";

export type InsightReply = { source: "ai"; text: string; model: string } | { source: "rules"; reason: FallbackReason };

export interface InsightResult {
  status: number;
  reply: InsightReply;
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface ServiceOptions {
  apiKey: string | undefined;
  fetchFn?: FetchFn;
  now?: () => number;
  /** A limiter shared with other AI routes, so their total stays within the plan. */
  allow?: (client: string) => boolean;
}

interface Usage {
  minuteStart: number;
  inMinute: number;
  dayStart: number;
  inDay: number;
}

export const fallback = (status: number, reason: FallbackReason): InsightResult => ({ status, reply: { source: "rules", reason } });

function prompt(facts: InsightFacts): string {
  return [
    "Facts:",
    ...factLines(facts).map((line) => `- ${line}`),
    "",
    "Explain what these facts mean for a lander at this site and time, using only these facts.",
  ].join("\n");
}

/** Plain sentences only: markdown marks and line breaks are taken out. */
export function cleaned(text: string): string {
  return text.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
}

/** Counts per visitor and in total; old visitors are dropped so memory stays bounded. */
export function createLimiter(now: () => number) {
  const clients = new Map<string, Usage>();
  let total = { dayStart: now(), inDay: 0 };

  return (client: string): boolean => {
    const at = now();
    if (at - total.dayStart >= DAY_MS) total = { dayStart: at, inDay: 0 };
    const usage = clients.get(client) ?? { minuteStart: at, inMinute: 0, dayStart: at, inDay: 0 };
    const minute = at - usage.minuteStart >= MINUTE_MS ? { minuteStart: at, inMinute: 0 } : usage;
    const day = at - usage.dayStart >= DAY_MS ? { dayStart: at, inDay: 0 } : usage;
    if (minute.inMinute >= CLIENT_PER_MINUTE || day.inDay >= CLIENT_PER_DAY || total.inDay >= ALL_PER_DAY) return false;

    clients.delete(client);
    clients.set(client, { minuteStart: minute.minuteStart, inMinute: minute.inMinute + 1, dayStart: day.dayStart, inDay: day.inDay + 1 });
    if (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value as string);
    total = { ...total, inDay: total.inDay + 1 };
    return true;
  };
}

/** The one limiter both AI routes count against: Groq's daily allowance is for the key, not per route. */
export const sharedLimiter = createLimiter(Date.now);

export function createInsightService({ apiKey, fetchFn = fetch, now = Date.now, allow = createLimiter(now) }: ServiceOptions) {
  const answers = new Map<string, string>();

  async function askAi(facts: InsightFacts, key: string): Promise<InsightResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchFn(GROQ_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt(facts) },
          ],
          temperature: 0.2,
          max_completion_tokens: MAX_TOKENS,
          reasoning_effort: "low",
          include_reasoning: false,
        }),
        signal: controller.signal,
      });
      if (response.status === 429) return fallback(429, "busy");
      if (!response.ok) {
        console.error(`insight: the AI answered ${response.status}`);
        return fallback(502, "failed");
      }
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? cleaned(content) : "";
      if (text.length < MIN_TEXT || text.length > MAX_TEXT) return fallback(502, "failed");
      if (strayNumbers(text, facts).length > 0) return fallback(502, "checked");
      return { status: 200, reply: { source: "ai", text, model: AI_MODEL } };
    } catch (error: unknown) {
      console.error("insight: the AI could not be reached", error instanceof Error ? error.message : error);
      return fallback(502, "failed");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async handle(body: string, client: string): Promise<InsightResult> {
      if (body.length > MAX_BODY_CHARS) return fallback(413, "invalid");
      let facts: InsightFacts;
      try {
        facts = parseFacts(JSON.parse(body));
      } catch {
        return fallback(400, "invalid");
      }
      if (!apiKey) return fallback(503, "off");

      const cacheKey = JSON.stringify(facts);
      const cached = answers.get(cacheKey);
      if (cached) return { status: 200, reply: { source: "ai", text: cached, model: AI_MODEL } };
      if (!allow(client)) return fallback(429, "busy");

      const result = await askAi(facts, apiKey);
      if (result.reply.source === "ai") {
        answers.set(cacheKey, result.reply.text);
        if (answers.size > MAX_CACHED) answers.delete(answers.keys().next().value as string);
      }
      return result;
    },
  };
}
