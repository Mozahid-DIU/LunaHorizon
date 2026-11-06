"use client";

import styles from "./classroom.module.css";
import { setClassroom, useClassroom } from "./useClassroom";

export function ClassroomToggle() {
  const isOn = useClassroom();
  return (
    <button
      type="button"
      className={styles.toggle}
      role="switch"
      aria-checked={isOn}
      aria-label="Classroom mode"
      title="Classroom mode: a short lesson on each page"
      onClick={() => setClassroom(!isOn)}
      data-testid="classroom-toggle"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 9l10-5 10 5-10 5z" />
        <path d="M6 11v5c3 2.5 9 2.5 12 0v-5" />
        <path d="M22 9v6" />
      </svg>
      <span className={styles.toggleLabel}>Classroom</span>
      <i className={styles.knob} aria-hidden="true" />
    </button>
  );
}
