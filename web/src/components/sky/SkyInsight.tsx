"use client";

import { useState } from "react";
import { ruleInsight, strayNumbers, type InsightFacts } from "@/lib/insight";
import type { FallbackReason, InsightReply } from "@/lib/insightService";
import styles from "./sky.module.css";

const REASONS: Record<FallbackReason, string> = {
  off: "The AI is switched off here, so this is our rule-based summary.",
  busy: "Too many requests just now. Try again in a minute.",
  failed: "The AI did not answer, so this is our rule-based summary.",
  checked: "The AI's answer used a number our engine did not give, so we did not show it.",
  invalid: "The request was not valid, so this is our rule-based summary.",
};

type Phase = { name: "rules" } | { name: "asking" } | { name: "ai"; text: string; model: string } | { name: "fallback"; reason: FallbackReason };

async function askInsight(facts: InsightFacts): Promise<Phase> {
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

/** The plain-language summary. Rule-based at once; the AI version only when asked for. */
export function SkyInsight({ facts }: { facts: InsightFacts }) {
  const factsKey = JSON.stringify(facts);
  const [state, setState] = useState<{ key: string; phase: Phase }>({ key: factsKey, phase: { name: "rules" } });
  const phase = state.key === factsKey ? state.phase : { name: "rules" as const };

  const onAsk = async () => {
    setState({ key: factsKey, phase: { name: "asking" } });
    const next = await askInsight(facts);
    setState((current) => (current.key === factsKey ? { key: factsKey, phase: next } : current));
  };

  return (
    <section className={styles.insight} aria-labelledby="insight-title">
      <h2 id="insight-title">In plain words</h2>
      <p className={styles.insightText} data-testid="insight-text" aria-live="polite">
        {phase.name === "ai" ? phase.text : ruleInsight(facts)}
      </p>
      <p className={styles.insightSource} role="status">
        {phase.name === "ai" && `Reworded by an AI model (${phase.model} on Groq). Each figure in it, with its unit, matches a figure from our engine; the wording itself is not checked.`}
        {phase.name === "fallback" && REASONS[phase.reason]}
        {(phase.name === "rules" || phase.name === "asking") && "Written by fixed rules from the engine's numbers."}
      </p>
      <div className={styles.insightActions}>
        {phase.name === "ai" ? (
          <button type="button" onClick={() => setState({ key: factsKey, phase: { name: "rules" } })}>
            Show the rule-based version
          </button>
        ) : (
          <button type="button" onClick={onAsk} disabled={phase.name === "asking"}>
            {phase.name === "asking" ? "Asking the AI…" : "Explain with AI"}
          </button>
        )}
      </div>
    </section>
  );
}
