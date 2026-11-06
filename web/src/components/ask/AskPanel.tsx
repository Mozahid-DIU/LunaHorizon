"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSelection } from "@/components/selection/useSelection";
import { MAX_HISTORY, MAX_QUESTION_CHARS, strayInAnswer, topicFor, TOPICS, type Topic } from "@/lib/ask";
import { DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { useSiteData } from "@/lib/data/useSiteData";
import { DATA_END_MS } from "@/lib/dataRange";
import { factsFrom, type InsightFacts } from "@/lib/insight";
import type { FallbackReason, InsightReply } from "@/lib/insightService";
import { formatUtc } from "@/lib/selection";
import { MISSION_DAYS, siteSummary } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import styles from "./ask.module.css";

const REASONS: Record<FallbackReason, string> = {
  off: "The AI is switched off here",
  busy: "Too many questions just now",
  failed: "The AI did not answer",
  checked: "The AI's answer used a figure our engine did not give, so we did not show it",
  invalid: "The question could not be sent",
  declined: "That question asks the AI to change its rules, so it was not sent to the AI",
};

type Message =
  | { role: "question"; text: string }
  | { role: "answer"; text: string; note: string; isAi: boolean }
  | { role: "waiting" }
  | { role: "unanswered"; note: string };

type AiAnswer = { ok: true; text: string; model: string } | { ok: false; reason: FallbackReason };

/** The last questions asked, oldest first, sent with a new one so a follow-up makes sense. */
const recentQuestions = (messages: readonly Message[]): string[] =>
  messages.flatMap((message) => (message.role === "question" ? [message.text] : [])).slice(-MAX_HISTORY);

async function askAi(facts: InsightFacts, question: string, history: string[]): Promise<AiAnswer> {
  try {
    const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, question, history }) });
    const reply = (await response.json()) as InsightReply;
    if (reply.source !== "ai") return { ok: false, reason: Object.hasOwn(REASONS, reply.reason) ? reply.reason : "failed" };
    // the same check as the server's, so a damaged or forged reply is refused too
    if (typeof reply.text !== "string" || strayInAnswer(reply.text, facts).length > 0) return { ok: false, reason: "checked" };
    return { ok: true, text: reply.text, model: reply.model };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

function Chat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v10H9l-5 4z" />
    </svg>
  );
}

/** The engine's facts for the chosen landing, or why there are none. */
function useFacts(site: SelectedSite, timeMs: number): { facts: InsightFacts | null; status: "loading" | "ready" | "past" | "error" } {
  const data = useSiteData({ site, startMs: timeMs, endMs: Math.min(timeMs + DEFAULT_SEARCH_MS, DATA_END_MS) });
  return useMemo(() => {
    if (data.status === "loading") return { facts: null, status: "loading" };
    if (data.status === "error") return { facts: null, status: "error" };
    const summary = siteSummary(data.ephemeris, site, data.profile, timeMs);
    return summary ? { facts: factsFrom(site, timeMs, summary, data.hasTerrain), status: "ready" } : { facts: null, status: "past" };
  }, [data, site, timeMs]);
}

function AskDialog({ onClose, isRaised }: { onClose: () => void; isRaised: boolean }) {
  const { selection } = useSelection();
  const { site, timeMs } = selection;
  const { facts, status } = useFacts(site, timeMs);
  const contextKey = `${site.id ?? `${site.lat},${site.lon}`}|${timeMs}`;
  const [chat, setChat] = useState<{ key: string; messages: Message[] }>({ key: contextKey, messages: [] });
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // a new site or date starts a new conversation: the old answers were about another landing
  const messages = chat.key === contextKey ? chat.messages : [];
  const isWaiting = messages.some((m) => m.role === "waiting");
  const currentKey = useRef(contextKey);
  useEffect(() => {
    currentKey.current = contextKey;
  }, [contextKey]);

  useEffect(() => input.current?.focus(), []);
  // Escape closes the panel from anywhere on the page
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  // a reply that arrives after the site or date changed belongs to another landing and is dropped
  const push = (key: string, ...more: Message[]) => {
    if (key !== currentKey.current) return;
    setChat((now) => ({ key, messages: [...(now.key === key ? now.messages : []).filter((m) => m.role !== "waiting"), ...more] }));
  };

  const ask = async (question: string, chosen: Topic | null) => {
    if (!facts || isWaiting) return;
    const key = contextKey;
    const history = recentQuestions(messages);
    push(key, { role: "question", text: question }, { role: "waiting" });
    const reply = await askAi(facts, question, history);
    if (reply.ok) {
      push(key, {
        role: "answer",
        text: reply.text,
        isAi: true,
        note: `Answered by an AI model (${reply.model} on Groq) from the engine's figures for this landing, our notes and our guide to the app and its sites. Each figure in it matches one of those; the wording itself is not checked.`,
      });
      return;
    }
    const topic = chosen ?? topicFor(question);
    if (topic) {
      push(key, { role: "answer", text: topic.answer(facts), isAi: false, note: `${REASONS[reply.reason]}, so this answer was written by fixed rules from the engine's figures.` });
    } else {
      push(key, { role: "unanswered", note: `${REASONS[reply.reason]}, and without it we can only answer the questions below.` });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = draft.replace(/\s+/g, " ").trim();
    if (!question || isWaiting || !facts) return;
    setDraft("");
    void ask(question, null);
  };

  return (
    <section className={`${styles.panel} ${isRaised ? styles.raised : ""}`} role="dialog" aria-label="Ask LunaHorizon" data-print="hide">
      <header className={styles.head}>
        <div>
          <h2>Ask LunaHorizon</h2>
          <p data-testid="ask-context">
            About {site.id === null ? "this custom site" : shortName(site)} · landing {formatUtc(timeMs)} · {MISSION_DAYS}-day mission
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close Ask LunaHorizon">
          ×
        </button>
      </header>

      <ol className={styles.messages} ref={list} aria-live="polite" aria-relevant="additions" data-testid="ask-messages">
        {messages.length === 0 && (
          <li className={styles.intro}>
            Ask anything about this landing, the sites LunaHorizon covers, the Moon ideas behind them, or how each page works. Answers use only our
            engine&apos;s figures and our own notes; any figure from anywhere else is not shown.
          </li>
        )}
        {messages.map((message, i) => {
          if (message.role === "question") {
            return (
              <li key={i} className={styles.question}>
                {message.text}
              </li>
            );
          }
          if (message.role === "waiting") {
            return (
              <li key={i} className={styles.waiting}>
                Working out the answer…
              </li>
            );
          }
          if (message.role === "unanswered") {
            return (
              <li key={i} className={styles.answer} data-testid="ask-answer">
                <small>{message.note}</small>
              </li>
            );
          }
          return (
            <li key={i} className={styles.answer} data-testid="ask-answer" data-source={message.isAi ? "ai" : "rules"}>
              <p>{message.text}</p>
              <small>{message.note}</small>
            </li>
          );
        })}
      </ol>

      {status !== "ready" ? (
        <p className={styles.state} role="status">
          {status === "loading" && "Working out this landing…"}
          {status === "past" && `A ${MISSION_DAYS}-day mission from this date runs past our data, which ends in 2030. Choose an earlier date to ask about it.`}
          {status === "error" && "This landing's data could not be loaded, so there is nothing to ask about yet."}
        </p>
      ) : (
        <>
          <div className={styles.chips} role="group" aria-label="Suggested questions">
            {TOPICS.map((topic) => (
              <button key={topic.id} type="button" onClick={() => ask(topic.question, topic)} disabled={isWaiting}>
                {topic.question}
              </button>
            ))}
          </div>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.srOnly} htmlFor="ask-question">
              Your question
            </label>
            <textarea
              id="ask-question"
              ref={input}
              rows={2}
              maxLength={MAX_QUESTION_CHARS}
              value={draft}
              placeholder="Ask about this landing, a site or a page"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
              }}
            />
            <button type="submit" disabled={isWaiting || !draft.trim()}>
              Ask
            </button>
          </form>
          <p className={styles.counter}>
            {draft.length}/{MAX_QUESTION_CHARS}
          </p>
        </>
      )}
    </section>
  );
}

/** A button on every page that opens Ask LunaHorizon about the chosen landing. */
export function AskLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  // the 3D page keeps its timeline along the bottom, so Ask sits above it there
  const isRaised = usePathname().startsWith("/3d");
  const launcher = useRef<HTMLButtonElement>(null);
  const close = () => {
    setIsOpen(false);
    launcher.current?.focus();
  };
  return (
    <>
      {isOpen && <AskDialog onClose={close} isRaised={isRaised} />}
      <button ref={launcher} type="button" className={`${styles.launcher} ${isRaised ? styles.raised : ""}`} onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-label="Ask LunaHorizon" data-print="hide" data-testid="ask-open">
        <Chat />
        <span>Ask</span>
      </button>
    </>
  );
}
