"use client";

import { useEffect, useRef, useState } from "react";
import { ruleInsight, strayNumbers, type InsightFacts } from "@/lib/insight";
import type { FallbackReason, InsightReply } from "@/lib/insightService";
import styles from "./sky.module.css";

const REASONS: Record<FallbackReason, string> = {
  off: "The AI is switched off here, so this is our rule-based summary.",
  busy: "Too many requests just now, so this is our rule-based summary. Try the AI again in a minute.",
  failed: "The AI did not answer, so this is our rule-based summary.",
  checked: "The AI's answer used a figure our engine did not give, so we did not show it. This is our rule-based summary.",
  invalid: "The request was not valid, so this is our rule-based summary.",
};

type Answer = { name: "asking" } | { name: "ai"; text: string; model: string } | { name: "fallback"; reason: FallbackReason };

async function askInsight(facts: InsightFacts): Promise<Answer> {
  try {
    const response = await fetch("/api/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(facts) });
    const reply = (await response.json()) as InsightReply;
    if (reply.source !== "ai") return { name: "fallback", reason: Object.hasOwn(REASONS, reply.reason) ? reply.reason : "failed" };
    // the same check as the server's, so a damaged or forged reply is refused too
    if (typeof reply.text !== "string" || strayNumbers(reply.text, facts).length > 0) return { name: "fallback", reason: "checked" };
    return { name: "ai", text: reply.text, model: reply.model };
  } catch {
    return { name: "fallback", reason: "failed" };
  }
}

function Sparkle() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 0.5 9.6 6.4 15.5 8 9.6 9.6 8 15.5 6.4 9.6 0.5 8 6.4 6.4Z" fill="currentColor" />
    </svg>
  );
}

interface View {
  key: string;
  answer: Answer;
  isShowingRules: boolean;
}

/**
 * The plain-language summary, asked for from the headline. A floating button offers the same
 * once the headline's button has scrolled out of sight.
 */
export function SkyInsight({ facts }: { facts: InsightFacts }) {
  const factsKey = JSON.stringify(facts);
  const [view, setView] = useState<View | null>(null);
  const [isTriggerHidden, setIsTriggerHidden] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const current = view?.key === factsKey ? view : null;

  useEffect(() => {
    const target = trigger.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setIsTriggerHidden(!entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [current]);

  const ask = async () => {
    setView({ key: factsKey, answer: { name: "asking" }, isShowingRules: false });
    const answer = await askInsight(facts);
    setView((now) => (now?.key === factsKey ? { ...now, answer } : now));
  };

  const askFromCorner = () => {
    const isMotionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ behavior: isMotionReduced ? "auto" : "smooth", block: "center" });
    if (!current) void ask();
    panel.current?.focus({ preventScroll: true });
  };

  const answer = current?.answer;
  const isAi = answer?.name === "ai" && !current?.isShowingRules;

  return (
    <>
      <section ref={panel} tabIndex={-1} className={`${styles.insight} ${current ? styles.insightOpen : ""}`} aria-label="In plain words">
        {current ? (
          <>
            <h2>In plain words</h2>
            <p className={styles.insightText} data-testid="insight-text" aria-live="polite">
              {isAi && answer?.name === "ai" ? answer.text : ruleInsight(facts)}
            </p>
            <p className={styles.insightSource} role="status">
              {answer?.name === "asking" && "Asking the AI… Meanwhile, this is our rule-based summary."}
              {isAi && answer?.name === "ai" && `Reworded by an AI model (${answer.model} on Groq). Each figure in it, with its unit, matches a figure from our engine; the wording itself is not checked.`}
              {answer?.name === "ai" && current.isShowingRules && "Written by fixed rules from the engine's numbers."}
              {answer?.name === "fallback" && REASONS[answer.reason]}
            </p>
            <div className={styles.insightActions}>
              {answer?.name === "ai" && (
                <button type="button" onClick={() => setView({ ...current, isShowingRules: !current.isShowingRules })}>
                  {current.isShowingRules ? "Show the AI version" : "Show the rule-based version"}
                </button>
              )}
              {answer?.name === "fallback" && (
                <button type="button" onClick={ask}>
                  Ask the AI again
                </button>
              )}
              <button type="button" onClick={() => setView(null)}>
                Close
              </button>
            </div>
          </>
        ) : (
          <button ref={trigger} type="button" className={styles.explain} onClick={ask}>
            <Sparkle />
            Explain in plain words
          </button>
        )}
      </section>
      {!current && isTriggerHidden && (
        <button type="button" className={styles.explainFloating} onClick={askFromCorner} aria-label="Explain this landing in plain words">
          <Sparkle />
          <span>Explain</span>
        </button>
      )}
    </>
  );
}
