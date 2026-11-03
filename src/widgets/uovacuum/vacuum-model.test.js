import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  ACTIVE_STATUSES,
  buildVacuumModel,
  entityIds,
  isValidDevice,
  resolveAction,
} from "./vacuum-model.mjs";

const DEVICE = "xiaomi_sg_1067980063_c102gl";
const ids = entityIds(DEVICE);

// What HA reported for this vacuum on 2026-11-03, docked and charging.
const DOCKED = {
  vacuum: "docked",
  battery: "98",
  charging: "正在充电",
  task: "0",
  time: "42",
  area: "26",
  fault: "0",
  suction: "标准",
  mainBrush: "95",
  sideBrush: "92",
  filter: "90",
  mop: "82",
};

function states(overrides = {}) {
  return Object.entries({ ...DOCKED, ...overrides })
    .filter(([, state]) => state !== undefined)
    .map(([key, state]) => ({
      entity_id: ids[key],
      state,
      last_updated: "2026-11-03T04:51:46.000Z",
    }));
}

describe("widgets/uovacuum/vacuum-model isValidDevice", () => {
  it("accepts the Xiaomi Home slug", () => {
    expect(isValidDevice(DEVICE)).toBe(true);
  });

  it("rejects anything that could reach another entity or path", () => {
    expect(isValidDevice("a/../b")).toBe(false);
    expect(isValidDevice("")).toBe(false);
    expect(isValidDevice("A")).toBe(false);
    expect(isValidDevice(undefined)).toBe(false);
  });
});

describe("widgets/uovacuum/vacuum-model entityIds", () => {
  it("builds every entity from the device slug", () => {
    expect(ids.vacuum).toBe(`vacuum.${DEVICE}`);
    expect(ids.task).toBe(`sensor.${DEVICE}_task_status_p_4_7`);
    expect(ids.suction).toBe(`select.${DEVICE}_mode_p_2_3`);
    expect(ids.stopClean).toBe(`button.${DEVICE}_stop_clean_a_4_2`);
    expect(ids.locate).toBe(`button.${DEVICE}_position_a_7_1`);
  });
});

describe("widgets/uovacuum/vacuum-model status", () => {
  it("is charging while docked below a full battery", () => {
    expect(buildVacuumModel(states(), DEVICE).status).toBe("charging");
  });

  it("is docked once the battery is full", () => {
    expect(buildVacuumModel(states({ battery: "100" }), DEVICE).status).toBe("docked");
  });

  it("is docked when the station reports it is not charging", () => {
    expect(buildVacuumModel(states({ charging: "不在充电" }), DEVICE).status).toBe("docked");
  });

  it("is preparing while a fresh job washes the mop at the dock", () => {
    expect(buildVacuumModel(states({ task: "1", time: "0" }), DEVICE).status).toBe("preparing");
  });

  it("is washingMidway when a job that already cleaned is back at the dock", () => {
    expect(buildVacuumModel(states({ task: "1", time: "12" }), DEVICE).status).toBe("washingMidway");
  });

  it("follows HA for cleaning and returning", () => {
    expect(buildVacuumModel(states({ vacuum: "cleaning", task: "1" }), DEVICE).status).toBe("cleaning");
    expect(buildVacuumModel(states({ vacuum: "returning", task: "1" }), DEVICE).status).toBe("returning");
  });

  it("treats vacuum.stop's idle-with-a-job as paused", () => {
    expect(buildVacuumModel(states({ vacuum: "idle", task: "1" }), DEVICE).status).toBe("paused");
    expect(buildVacuumModel(states({ vacuum: "paused", task: "1" }), DEVICE).status).toBe("paused");
  });

  it("is idle when stopped away from the dock with no job", () => {
    expect(buildVacuumModel(states({ vacuum: "idle", task: "0" }), DEVICE).status).toBe("idle");
  });

  it("does not guess docked or idle when the task sensor cannot be read", () => {
    expect(buildVacuumModel(states({ task: "unavailable" }), DEVICE).status).toBe("offline");
    expect(buildVacuumModel(states({ task: undefined }), DEVICE).status).toBe("offline");
    expect(buildVacuumModel(states({ vacuum: "idle", task: "unknown" }), DEVICE).status).toBe("offline");
    // HA's own state is enough here
    expect(buildVacuumModel(states({ vacuum: "cleaning", task: "unknown" }), DEVICE).status).toBe("cleaning");
  });

  it("is offline when the vacuum entity is missing or unavailable", () => {
    expect(buildVacuumModel(states({ vacuum: undefined }), DEVICE).status).toBe("offline");
    expect(buildVacuumModel(states({ vacuum: "unavailable" }), DEVICE).status).toBe("offline");
    expect(buildVacuumModel(states({ vacuum: "unknown" }), DEVICE).status).toBe("offline");
  });
});

describe("widgets/uovacuum/vacuum-model offline values", () => {
  it("never turns a missing device into zeros", () => {
    const model = buildVacuumModel([], DEVICE);

    expect(model).toMatchObject({
      status: "offline",
      battery: null,
      cleaningMinutes: null,
      cleaningArea: null,
      suction: null,
      faultCode: null,
      updatedAt: null,
    });
    expect(model.consumables).toEqual({ low: false, lowest: null });
  });
});

describe("widgets/uovacuum/vacuum-model fault", () => {
  it("shows the fault code only in the error state", () => {
    expect(buildVacuumModel(states({ vacuum: "error", fault: "68" }), DEVICE)).toMatchObject({
      status: "error",
      faultCode: "68",
    });
    // 68 was left over while the robot sat docked and healthy
    expect(buildVacuumModel(states({ fault: "68" }), DEVICE).faultCode).toBeNull();
    expect(buildVacuumModel(states({ vacuum: "error", fault: "0" }), DEVICE).faultCode).toBeNull();
  });
});

describe("widgets/uovacuum/vacuum-model numbers", () => {
  it("reads battery, time and area", () => {
    expect(buildVacuumModel(states(), DEVICE)).toMatchObject({
      battery: 98,
      cleaningMinutes: 42,
      cleaningArea: 26,
      updatedAt: "2026-11-03T04:51:46.000Z",
    });
  });

  it("shows an aborted or fresh job's zero time and area as unknown", () => {
    const model = buildVacuumModel(states({ time: "0", area: "0" }), DEVICE);

    expect(model.cleaningMinutes).toBeNull();
    expect(model.cleaningArea).toBeNull();
  });

  it("treats non-numeric sensor states as unknown", () => {
    const model = buildVacuumModel(states({ time: "unknown", area: "unavailable", battery: "unknown" }), DEVICE);

    expect(model.cleaningMinutes).toBeNull();
    expect(model.cleaningArea).toBeNull();
    expect(model.battery).toBeNull();
  });
});

describe("widgets/uovacuum/vacuum-model runScope", () => {
  it("labels the numbers as this run while a job is out or just stopped", () => {
    for (const vacuum of ["cleaning", "returning", "idle", "paused"]) {
      expect(buildVacuumModel(states({ vacuum, task: "1" }), DEVICE).runScope).toBe("current");
    }
    expect(buildVacuumModel(states({ task: "1", time: "0" }), DEVICE).runScope).toBe("current");
    expect(buildVacuumModel(states({ vacuum: "idle", task: "0" }), DEVICE).runScope).toBe("current");
  });

  it("labels the numbers as the last run while docked", () => {
    expect(buildVacuumModel(states(), DEVICE).runScope).toBe("last");
    expect(buildVacuumModel(states({ battery: "100" }), DEVICE).runScope).toBe("last");
  });
});

describe("widgets/uovacuum/vacuum-model suction", () => {
  it("maps HA's Chinese options to the card's ids", () => {
    expect(buildVacuumModel(states({ suction: "安静/静音" }), DEVICE).suction).toBe("quiet");
    expect(buildVacuumModel(states(), DEVICE).suction).toBe("standard");
    expect(buildVacuumModel(states({ suction: "强力" }), DEVICE).suction).toBe("strong");
    expect(buildVacuumModel(states({ suction: "全速模式（Max）" }), DEVICE).suction).toBe("max");
    expect(buildVacuumModel(states({ suction: "Turbo" }), DEVICE).suction).toBeNull();
  });
});

describe("widgets/uovacuum/vacuum-model consumables", () => {
  it("reports the lowest part when everything is fine", () => {
    expect(buildVacuumModel(states(), DEVICE).consumables).toEqual({
      low: false,
      lowest: { part: "mop", percent: 82 },
    });
  });

  it("flags a part at or below 10%", () => {
    expect(buildVacuumModel(states({ filter: "8" }), DEVICE).consumables).toEqual({
      low: true,
      lowest: { part: "filter", percent: 8 },
    });
    expect(buildVacuumModel(states({ sideBrush: "10" }), DEVICE).consumables.low).toBe(true);
  });

  it("skips parts whose level is unknown", () => {
    const model = buildVacuumModel(states({ mop: "unknown", filter: "unavailable" }), DEVICE);

    expect(model.consumables).toEqual({ low: false, lowest: { part: "sideBrush", percent: 92 } });
  });
});

describe("widgets/uovacuum/vacuum-model ACTIVE_STATUSES", () => {
  it("lists the statuses that poll fast", () => {
    expect(ACTIVE_STATUSES).toEqual(["preparing", "washingMidway", "cleaning", "paused", "returning"]);
  });
});

describe("widgets/uovacuum/vacuum-model resolveAction", () => {
  it("lists the allowed actions", () => {
    expect(ACTIONS).toEqual(["start", "stop", "dock", "suction", "dust", "wash", "dryStart", "dryStop", "locate"]);
  });

  it("maps the main buttons, with stop ending the job instead of pausing it", () => {
    expect(resolveAction("start", undefined, DEVICE)).toEqual({
      domain: "vacuum",
      service: "start",
      data: { entity_id: ids.vacuum },
    });
    expect(resolveAction("stop", undefined, DEVICE)).toEqual({
      domain: "button",
      service: "press",
      data: { entity_id: ids.stopClean },
    });
    expect(resolveAction("dock", undefined, DEVICE)).toEqual({
      domain: "vacuum",
      service: "return_to_base",
      data: { entity_id: ids.vacuum },
    });
  });

  it("maps suction ids to HA's Chinese options", () => {
    expect(resolveAction("suction", "max", DEVICE)).toEqual({
      domain: "select",
      service: "select_option",
      data: { entity_id: ids.suction, option: "全速模式（Max）" },
    });
    expect(resolveAction("suction", "quiet", DEVICE).data.option).toBe("安静/静音");
    expect(resolveAction("suction", "turbo", DEVICE)).toBeNull();
    expect(resolveAction("suction", undefined, DEVICE)).toBeNull();
  });

  it("maps the station and locate buttons", () => {
    const pressed = (action) => resolveAction(action, undefined, DEVICE);

    expect(pressed("dust")).toEqual({ domain: "button", service: "press", data: { entity_id: ids.dust } });
    expect(pressed("wash").data.entity_id).toBe(ids.wash);
    expect(pressed("dryStart").data.entity_id).toBe(ids.dryStart);
    expect(pressed("dryStop").data.entity_id).toBe(ids.dryStop);
    expect(pressed("locate").data.entity_id).toBe(ids.locate);
  });

  it("refuses anything else", () => {
    expect(resolveAction("reset", undefined, DEVICE)).toBeNull();
    expect(resolveAction("", undefined, DEVICE)).toBeNull();
    expect(resolveAction(undefined, undefined, DEVICE)).toBeNull();
    expect(resolveAction("toString", undefined, DEVICE)).toBeNull();
    expect(resolveAction("suction", "constructor", DEVICE)).toBeNull();
  });
});
