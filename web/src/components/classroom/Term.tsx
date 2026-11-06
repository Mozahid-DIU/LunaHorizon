"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type TermId } from "@/lib/classroom";
import styles from "./classroom.module.css";
import { useClassroom } from "./useClassroom";

interface TermProps {
  id: TermId;
  children?: ReactNode;
}

/** A word with its plain meaning one tap away. Outside Classroom mode it is the plain text. */
export function Term({ id, children }: TermProps) {
  const isOn = useClassroom();
  const text = children ?? GLOSSARY[id].word;
  if (!isOn) return <>{text}</>;
  return <TermButton id={id}>{text}</TermButton>;
}

function TermButton({ id, children }: { id: TermId; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const { word, meaning } = GLOSSARY[id];

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        button.current?.focus();
      } else if (wrap.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [isOpen]);

  return (
    <span ref={wrap} className={styles.term}>
      <button ref={button} type="button" className={styles.termWord} aria-expanded={isOpen} aria-controls={popId} onClick={() => setOpen((open) => !open)}>
        {children}
      </button>
      <span id={popId} className={styles.termPop} role="note" hidden={!isOpen}>
        <span className={styles.termKicker}>Plain words</span>
        <b>{word}</b>: {meaning}
      </span>
    </span>
  );
}
