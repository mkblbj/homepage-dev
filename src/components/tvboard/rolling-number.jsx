import classNames from "classnames";
import { useEffect, useRef, useState } from "react";

import { numberEffect } from "./number-effect.mjs";
import styles from "./tvboard.module.css";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const EFFECT_MS = 1800;

// Each digit is a column 0–9 that slides to its value, so a change rolls like an odometer.
// A rise from one known value to another also glows and floats a "+N" chip for 1.8s.
export default function RollingNumber({ value, size, tone = "blue", showDelta = false, className, style }) {
  const previous = useRef(value);
  const [effect, setEffect] = useState({ flash: false, delta: null, key: 0 });

  useEffect(() => {
    const change = numberEffect(previous.current, value);
    previous.current = value;
    if (!change.animate) return undefined;
    setEffect((current) => ({ flash: true, delta: change.delta, key: current.key + 1 }));
    const timer = setTimeout(() => setEffect((current) => ({ ...current, flash: false, delta: null })), EFFECT_MS);
    return () => clearTimeout(timer);
  }, [value]);

  if (value === null || value === undefined) {
    return (
      <span className={classNames(styles.rolling, styles.unknown, className)} style={{ fontSize: size, ...style }}>
        —
      </span>
    );
  }

  const text = Number(value).toLocaleString("ja-JP");
  const chars = text.split("");

  return (
    <span
      className={classNames(styles.rolling, className)}
      data-flash={effect.flash ? "true" : "false"}
      data-tone={tone}
      style={{ fontSize: size, ...style }}
    >
      {chars.map((char, index) => {
        // keyed from the right so 999 → 1,000 keeps the ones column in place
        const key = `p${chars.length - index}`;
        if (!/[0-9]/.test(char)) {
          return (
            <span key={key} className={styles.separator}>
              {char}
            </span>
          );
        }
        return (
          <span key={key} className={styles.digitWindow} data-digit>
            <span className={styles.digitColumn} style={{ transform: `translateY(-${char}em)` }}>
              {DIGITS.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        );
      })}
      {showDelta && effect.delta !== null ? (
        <span key={effect.key} className={styles.delta} data-delta>
          +{effect.delta}
        </span>
      ) : null}
    </span>
  );
}
