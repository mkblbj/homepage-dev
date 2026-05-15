export const DEFAULT_ANNOUNCEMENT_LABEL = "公告";
export const DEFAULT_ANNOUNCEMENT_ICON = "📢";
export const DEFAULT_ANNOUNCEMENT_SPEED_SECONDS = 28;

const MIN_ANNOUNCEMENT_SPEED_SECONDS = 8;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSpeedSeconds(value) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue >= MIN_ANNOUNCEMENT_SPEED_SECONDS) {
    return numericValue;
  }

  return DEFAULT_ANNOUNCEMENT_SPEED_SECONDS;
}

function normalizeLink(link) {
  const label = normalizeText(link?.label);
  const href = normalizeText(link?.href);

  if (!label || !href) {
    return null;
  }

  return {
    label,
    href,
  };
}

function normalizeAnnouncementItem(item, index) {
  if (!item || item.enabled !== true) {
    return null;
  }

  const text = normalizeText(item.text);
  if (!text) {
    return null;
  }

  const links = Array.isArray(item.links) ? item.links.map(normalizeLink).filter(Boolean) : [];

  return {
    id: normalizeText(item.id) || `announcement-${index + 1}`,
    text,
    icon: normalizeText(item.icon) || DEFAULT_ANNOUNCEMENT_ICON,
    links,
  };
}

export function normalizeAnnouncementConfig(config = {}) {
  const label = normalizeText(config?.label) || DEFAULT_ANNOUNCEMENT_LABEL;
  const speedSeconds = normalizeSpeedSeconds(config?.speedSeconds);

  if (config?.enabled !== true) {
    return {
      enabled: false,
      label,
      speedSeconds,
      items: [],
    };
  }

  const items = Array.isArray(config.items)
    ? config.items.map((item, index) => normalizeAnnouncementItem(item, index)).filter(Boolean)
    : [];

  return {
    enabled: items.length > 0,
    label,
    speedSeconds,
    items,
  };
}
