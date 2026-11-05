import qrcode from "qrcode-generator";
import styles from "./brief.module.css";

/** A QR code for the live brief, drawn as squares so it prints sharp. */
export function BriefQr({ url }: { url: string }) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < count && qr.isDark(row, col)) col += 1;
      cells.push(`M${start} ${row}h${col - start}v1h${start - col}z`);
    }
  }
  return (
    <svg className={styles.qr} viewBox={`-1 -1 ${count + 2} ${count + 2}`} role="img" aria-label={`QR code that opens this brief online: ${url}`} data-testid="brief-qr" data-url={url}>
      <rect x={-1} y={-1} width={count + 2} height={count + 2} fill="#fff" />
      <path d={cells.join("")} fill="#14161c" />
    </svg>
  );
}
