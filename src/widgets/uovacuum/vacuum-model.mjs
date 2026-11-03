/*
 * uovacuum — the robot vacuum card's view of Home Assistant.
 *
 * Built against Xiaomi Home's X20+ (xiaomi.vacuum.c102gl) as tested live on 2026-11-03:
 *   - HA's `vacuum.stop` only pauses (state idle, task status stays 1); the
 *     stop-clean button really ends the job, so the card's 停止 presses that.
 *   - A fresh job first washes the mop at the dock: HA says `docked` while the
 *     task status says 1. Drying, mop washing and dust collecting also read as
 *     `docked`, and the dry-time sensor sticks at an old value, so none of them
 *     is reported here.
 *   - Cleaning time and area restart at 0 and stay 0 after an aborted job, so 0
 *     means "nothing to show", never "0 minutes".
 * Entity ids are always built here from the configured device slug; nothing the
 * browser sends can name an entity.
 */

const DEVICE_PATTERN = /^[a-z0-9_]+$/;

const ENTITY_SUFFIXES = {
  vacuum: ["vacuum", ""],
  battery: ["sensor", "_battery_level_p_3_1"],
  charging: ["sensor", "_charging_state_p_3_2"],
  task: ["sensor", "_task_status_p_4_7"],
  time: ["sensor", "_cleaning_time_p_4_2"],
  area: ["sensor", "_cleaning_area_p_4_3"],
  fault: ["sensor", "_fault_p_2_2"],
  suction: ["select", "_mode_p_2_3"],
  mainBrush: ["sensor", "_brush_life_level_p_9_2"],
  sideBrush: ["sensor", "_brush_life_level_p_10_2"],
  filter: ["sensor", "_filter_life_level_p_11_1"],
  mop: ["sensor", "_mop_life_level_p_18_1"],
  stopClean: ["button", "_stop_clean_a_4_2"],
  dust: ["button", "_start_dust_arrest_a_2_4"],
  wash: ["button", "_start_mop_wash_a_2_6"],
  dryStart: ["button", "_start_dry_a_2_8"],
  dryStop: ["button", "_stop_dry_a_2_9"],
  locate: ["button", "_position_a_7_1"],
};

// HA's own option labels for the suction select, verbatim (note the full-width brackets).
const SUCTION_OPTIONS = {
  quiet: "安静/静音",
  standard: "标准",
  strong: "强力",
  max: "全速模式（Max）",
};

const CHARGING = "正在充电";
const CONSUMABLE_PARTS = ["mainBrush", "sideBrush", "filter", "mop"];
const LOW_CONSUMABLE_PERCENT = 10;

export const ACTIVE_STATUSES = ["preparing", "washingMidway", "cleaning", "paused", "returning"];
const CURRENT_RUN_STATUSES = [...ACTIVE_STATUSES, "idle"];

const BUTTON_ACTIONS = {
  stop: "stopClean",
  dust: "dust",
  wash: "wash",
  dryStart: "dryStart",
  dryStop: "dryStop",
  locate: "locate",
};

export const ACTIONS = ["start", "stop", "dock", "suction", "dust", "wash", "dryStart", "dryStop", "locate"];

export function isValidDevice(device) {
  return typeof device === "string" && DEVICE_PATTERN.test(device);
}

export function entityIds(device) {
  return Object.fromEntries(
    Object.entries(ENTITY_SUFFIXES).map(([key, [domain, suffix]]) => [key, `${domain}.${device}${suffix}`]),
  );
}

function toNumber(state) {
  if (state === undefined || state === null || state === "") return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}

function positiveOrNull(state) {
  const value = toNumber(state);
  return value !== null && value > 0 ? value : null;
}

function statusOf(vacuum, { task, battery, charging, cleaningMinutes }) {
  const jobRunning = task === 1;
  switch (vacuum) {
    case "cleaning":
    case "returning":
    case "error":
      return vacuum;
    case "paused":
      return "paused";
    // idle and docked can only be told apart from paused / preparing by the task
    // sensor; without it, say we cannot tell rather than guess "no job"
    case "idle":
      if (task === null) return "offline";
      return jobRunning ? "paused" : "idle";
    case "docked":
      if (task === null) return "offline";
      if (jobRunning) return cleaningMinutes ? "washingMidway" : "preparing";
      return charging === CHARGING && battery !== null && battery < 100 ? "charging" : "docked";
    default:
      return "offline";
  }
}

function consumablesOf(read) {
  const levels = CONSUMABLE_PARTS.map((part) => ({ part, percent: toNumber(read(part)) })).filter(
    (level) => level.percent !== null,
  );
  if (!levels.length) return { low: false, lowest: null };

  const lowest = levels.reduce((low, level) => (level.percent < low.percent ? level : low));
  return {
    low: lowest.percent <= LOW_CONSUMABLE_PERCENT,
    lowest: { part: lowest.part, percent: Math.round(lowest.percent) },
  };
}

export function buildVacuumModel(states, device) {
  const ids = entityIds(device);
  const byId = new Map((Array.isArray(states) ? states : []).map((entity) => [entity?.entity_id, entity]));
  const read = (key) => byId.get(ids[key])?.state;

  const vacuum = byId.get(ids.vacuum);
  const battery = toNumber(read("battery"));
  const cleaningMinutes = positiveOrNull(read("time"));
  const status = statusOf(vacuum?.state, {
    task: toNumber(read("task")),
    battery,
    charging: read("charging"),
    cleaningMinutes,
  });

  if (status === "offline") {
    return {
      status,
      battery: null,
      cleaningMinutes: null,
      cleaningArea: null,
      runScope: "last",
      suction: null,
      consumables: { low: false, lowest: null },
      faultCode: null,
      updatedAt: null,
    };
  }

  const fault = read("fault");
  const suctionState = read("suction");

  return {
    status,
    battery: battery === null ? null : Math.round(battery),
    cleaningMinutes,
    cleaningArea: positiveOrNull(read("area")),
    runScope: CURRENT_RUN_STATUSES.includes(status) ? "current" : "last",
    suction: Object.keys(SUCTION_OPTIONS).find((id) => SUCTION_OPTIONS[id] === suctionState) ?? null,
    consumables: consumablesOf(read),
    faultCode: status === "error" && toNumber(fault) ? String(fault) : null,
    updatedAt: vacuum.last_updated ?? null,
  };
}

export function resolveAction(action, value, device) {
  const ids = entityIds(device);

  if (action === "start") {
    return { domain: "vacuum", service: "start", data: { entity_id: ids.vacuum } };
  }
  if (action === "dock") {
    return { domain: "vacuum", service: "return_to_base", data: { entity_id: ids.vacuum } };
  }
  if (action === "suction") {
    if (typeof value !== "string" || !Object.hasOwn(SUCTION_OPTIONS, value)) return null;
    return {
      domain: "select",
      service: "select_option",
      data: { entity_id: ids.suction, option: SUCTION_OPTIONS[value] },
    };
  }
  if (typeof action === "string" && Object.hasOwn(BUTTON_ACTIONS, action)) {
    return { domain: "button", service: "press", data: { entity_id: ids[BUTTON_ACTIONS[action]] } };
  }
  return null;
}
