import { Fragment, useState } from "react";

import styles from "./announcement-banner.module.css";

function AnnouncementItem({ item }) {
  return (
    <Fragment>
      <span className={styles["announcement-banner__item-icon"]} aria-hidden="true">
        {item.icon}
      </span>
      <span className={styles["announcement-banner__item-text"]}>{item.text}</span>
      {item.links?.map((link) => (
        <a key={link.href} className={styles["announcement-banner__link"]} href={link.href}>
          {link.label}
        </a>
      ))}
    </Fragment>
  );
}

export default function AnnouncementBanner({ announcement }) {
  const [hidden, setHidden] = useState(false);
  const items = announcement?.items ?? [];

  if (!announcement?.enabled || items.length === 0 || hidden) {
    return null;
  }

  const label = announcement.label || "公告";
  const speedSeconds = announcement.speedSeconds || 28;
  const loopItems = [...items, ...items];

  return (
    <div
      className={styles["announcement-banner"]}
      role="banner"
      aria-label={label}
      style={{ "--announcement-banner-speed": `${speedSeconds}s` }}
    >
      <div className={styles["announcement-banner__tag"]}>
        <span className={styles["announcement-banner__tag-dot"]} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className={styles["announcement-banner__marquee"]}>
        <div className={styles["announcement-banner__track"]}>
          {loopItems.map((item, index) => (
            <span
              key={`${item.id}-${index < items.length ? "primary" : "repeat"}`}
              className={styles["announcement-banner__item"]}
            >
              <AnnouncementItem item={item} />
              <span className={styles["announcement-banner__separator"]} aria-hidden="true">
                ◆
              </span>
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles["announcement-banner__close"]}
        aria-label="关闭公告"
        onClick={() => setHidden(true)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path
            d="M3 3l8 8M11 3l-8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
