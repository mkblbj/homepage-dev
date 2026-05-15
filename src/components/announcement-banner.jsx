import { Fragment, useState } from "react";

import styles from "./announcement-banner.module.css";

function AnnouncementItem({ item }) {
  return (
    <span className={styles["announcement-banner__item"]}>
      {item.icon && (
        <span className={styles["announcement-banner__item-icon"]} aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className={styles["announcement-banner__item-text"]}>{item.text}</span>
      {item.links?.map((link) => (
        <a key={`${item.id}-${link.href}`} className={styles["announcement-banner__link"]} href={link.href}>
          {link.label}
        </a>
      ))}
    </span>
  );
}

export default function AnnouncementBanner({ announcement }) {
  const [hidden, setHidden] = useState(false);
  const items = announcement?.items ?? [];

  if (hidden || !announcement?.enabled || items.length === 0) {
    return null;
  }

  const label = announcement.label || "公告";
  const speedSeconds = Number(announcement.speedSeconds) > 0 ? Number(announcement.speedSeconds) : 28;
  const loopItems = [...items, ...items];

  return (
    <div className={styles["announcement-banner"]} role="banner" aria-label={label}>
      <div className={styles["announcement-banner__tag"]}>
        <span className={styles["announcement-banner__tag-dot"]} aria-hidden="true" />
        {label}
      </div>
      <div className={styles["announcement-banner__marquee"]}>
        <div
          className={styles["announcement-banner__track"]}
          style={{ "--announcement-scroll-duration": `${speedSeconds}s` }}
        >
          {loopItems.map((item, index) => (
            <Fragment key={`${item.id}-${index}`}>
              <AnnouncementItem item={item} />
              {index < loopItems.length - 1 && (
                <span className={styles["announcement-banner__separator"]} aria-hidden="true">
                  ◆
                </span>
              )}
            </Fragment>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles["announcement-banner__close"]}
        aria-label="关闭公告"
        onClick={() => setHidden(true)}
      >
        <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
          <path
            d="M1 1l12 12M13 1L1 13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
