import classNames from "classnames";
import { useState } from "react";

import { formatClock } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

export function cardStateClass(state) {
  if (state === "delayed") return styles.delayed;
  if (state === "unavailable") return styles.unavailable;
  return null;
}

// "● 13:14 更新" while fresh, "遅延 13:54 のデータ" once late.
export function Stamp({ state, stampMs, className }) {
  if (stampMs == null || state === "loading" || state === "unavailable") return null;
  const time = formatClock(new Date(stampMs));
  if (state === "delayed") {
    return (
      <span className={classNames(styles.stamp, styles.stampLate, className)}>
        <span className={classNames(styles.dot, styles.dotWarn)} />
        遅延 {time} のデータ
      </span>
    );
  }
  return (
    <span className={classNames(styles.stamp, className)}>
      <span className={styles.dot} />
      {time} 更新
    </span>
  );
}

export function Unavailable({ what, lastOkAt, compact = false }) {
  return (
    <div className={styles.unavailableBlock}>
      {compact ? null : (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      )}
      <span className={styles.unavailableTitle}>{what}を取得できません</span>
      {lastOkAt ? (
        <span className={styles.unavailableNote}>最後に取得できた時刻 {formatClock(new Date(lastOkAt))}</span>
      ) : null}
    </div>
  );
}

export function Unconfigured() {
  return <div className={styles.loading}>設定がありません</div>;
}

export function Loading() {
  return <div className={styles.loading}>読み込み中…</div>;
}

// Shop logos load from 楽天's cabinet; a missing or broken one falls back to the name's first letter.
export function ShopLogo({ name, url, className }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return <span className={classNames(styles.logo, styles.logoFallback, className)}>{Array.from(name || "?")[0]}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className={classNames(styles.logo, className)} onError={() => setBroken(true)} />;
}

const AVATAR_COLORS = ["#3B4C5E", "#4A4F63", "#3F5650", "#544A42", "#4B4458", "#3D5160"];

function colorFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.codePointAt(0)) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// HR photo when there is one; otherwise (or when it fails to load) the family name's first letter.
export function Avatar({ id, initial, photoUrl, className }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = photoUrl && !broken;
  return (
    <span className={classNames(styles.avatar, className)} style={{ background: colorFor(id) }}>
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

// Same rule as the 出勤 widget: only same-origin /files/ paths on the HR host become photos.
export function resolvePhotoUrl(image, baseUrl) {
  if (typeof image !== "string" || !image.startsWith("/files/") || !baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    const url = new URL(image, base);
    return url.origin === base.origin && url.pathname.startsWith("/files/") ? url.href : null;
  } catch {
    return null;
  }
}
