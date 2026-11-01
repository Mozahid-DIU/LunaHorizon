import styles from "./shell.module.css";

interface PagePlaceholderProps {
  title: string;
  purpose: string;
}

/** Stands in for a page until its feature is built; it shows no numbers. */
export function PagePlaceholder({ title, purpose }: PagePlaceholderProps) {
  return (
    <div className={styles.placeholder}>
      <p className={styles.kicker}>In development</p>
      <h1>{title}</h1>
      <p>{purpose}</p>
    </div>
  );
}
