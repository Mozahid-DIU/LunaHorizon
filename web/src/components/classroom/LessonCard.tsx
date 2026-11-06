"use client";

import Link from "next/link";
import { Suspense, useId, useState } from "react";
import { useSelection } from "@/components/selection/useSelection";
import { findLesson, LESSONS, lessonNeighbours, type LessonId } from "@/lib/classroom";
import type { LessonAnswer } from "@/lib/classroomAnswers";
import { withQuery } from "@/lib/selection";
import styles from "./classroom.module.css";
import { Term } from "./Term";
import { useClassroom } from "./useClassroom";

interface LessonCardProps {
  id: LessonId;
  answer: LessonAnswer;
}

/** The page's lesson while Classroom mode is on; nothing otherwise. Use inside Suspense. */
export function LessonCard(props: LessonCardProps) {
  const isOn = useClassroom();
  if (!isOn) return null;
  // the card reads the address; its own boundary keeps every page safe to prerender
  return (
    <Suspense>
      <Card key={props.id} {...props} />
    </Suspense>
  );
}

function AnswerBox({ answer }: { answer: LessonAnswer }) {
  if (answer.kind === "calculating") return <p className={styles.answerWait}>The engine is still calculating…</p>;
  if (answer.kind === "unavailable") return <p className={styles.answerWait}>{answer.reason}</p>;
  return (
    <>
      <strong className={styles.answerBig} data-testid="lesson-answer">
        {answer.big}
      </strong>
      <span className={styles.answerWhy}>{answer.why}</span>
      <span className={styles.answerSource}>{answer.source}</span>
    </>
  );
}

function Card({ id, answer }: LessonCardProps) {
  const { query } = useSelection();
  const [isShown, setShown] = useState(false);
  const titleId = useId();
  const answerId = useId();
  const lesson = findLesson(id);
  const { number, previous, next } = lessonNeighbours(id);

  return (
    <section className={styles.card} aria-labelledby={titleId} data-testid="lesson-card" data-print="hide">
      <div className={styles.side}>
        <p className={styles.kicker}>Classroom</p>
        <p className={styles.count}>
          Lesson {number}
          <span> of {LESSONS.length}</span>
        </p>
        <ol className={styles.path} aria-label="Lessons">
          {LESSONS.map((item, i) => (
            <li key={item.id} data-state={i + 1 < number ? "done" : i + 1 === number ? "now" : "next"}>
              <Link href={withQuery(item.href, query)} aria-current={item.id === id ? "step" : undefined}>
                {item.page}
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.body}>
        <p className={styles.kicker}>The idea</p>
        <h2 id={titleId}>{lesson.idea}</h2>
        <p>{lesson.body}</p>
        <p className={styles.try}>
          <b>Try this</b>
          <span>{lesson.tryThis}</span>
        </p>
        <p className={styles.words}>
          <span className={styles.kicker}>Words</span>
          {lesson.terms.map((term) => (
            <Term key={term} id={term} />
          ))}
        </p>
      </div>

      <div className={styles.question}>
        <p className={styles.kicker}>Question</p>
        <p className={styles.ask}>{lesson.question}</p>
        <button type="button" className={styles.reveal} aria-expanded={isShown} aria-controls={answerId} onClick={() => setShown((shown) => !shown)}>
          {isShown ? "Hide answer" : "Show answer"}
        </button>
        <div id={answerId} className={styles.answer} hidden={!isShown}>
          {isShown && <AnswerBox answer={answer} />}
        </div>
        <nav className={styles.steps} aria-label="Lesson steps">
          {previous ? <Link href={withQuery(previous.href, query)}>‹ {previous.page}</Link> : <span />}
          {next ? (
            <Link className={styles.next} href={withQuery(next.href, query)}>
              Next: {next.page} ›
            </Link>
          ) : (
            <span className={styles.done}>Last lesson</span>
          )}
        </nav>
      </div>
    </section>
  );
}
