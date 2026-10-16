import { useMemo } from "react";

import { buildTodayAttendanceModel } from "../../widgets/uoattendance/attendance-model.mjs";

import CourierPanel from "./courier-panel";
import FooterBar from "./footer-bar";
import { FRESHNESS } from "./freshness.mjs";
import { OutputCard, ShippingCard, TomorrowCard } from "./kpi-cards";
import { AttentionPanel, OrdersPanel } from "./rakuten-panels";
import { buildAttentionView, buildOrdersView } from "./rakuten-model.mjs";
import { buildShippingView } from "./shipping-model.mjs";
import { buildShiftTimeline, buildTomorrowShifts } from "./shift-model.mjs";
import { ShiftTimeline, TomorrowShifts } from "./staff-panels";
import { buildTickerSegments, buildWeatherView, buildWeatherViewFromWeatherApi } from "./ticker-model.mjs";
import { jstNow, parseJstStamp } from "./tv-time.mjs";
import styles from "./tvboard.module.css";
import { sourceState, useClock, useDailyReload, useProxy, useSource } from "./use-tv-data";

function lateDetail(state, stampMs, nowMs) {
  if (state === "unavailable") return "取得できません";
  const minutes = stampMs == null ? null : Math.max(1, Math.round((nowMs - stampMs) / 60e3));
  return minutes == null ? "遅延" : `${minutes}分 遅延`;
}

export default function Board({ sources }) {
  const clock = useClock();
  useDailyReload(clock);
  const nowMs = clock.getTime();
  const now = jstNow(clock);

  const attendanceWidget = sources.attendance;
  const scheduleWidget = attendanceWidget?.scheduleUrl ? attendanceWidget : null;

  const shipping = useProxy(sources.shipping, null, null, FRESHNESS.shipping.poll);
  const sales = useProxy(sources.rakuten, "sales", null, FRESHNESS.rakuten.poll);
  const monthly = useProxy(sources.rakuten, "monthly", null, FRESHNESS.monthly.poll);
  const logos = useProxy(sources.rakuten, "logos", null, FRESHNESS.logos.poll);
  const attention = useProxy(sources.attention, "attention", null, FRESHNESS.attention.poll);
  const actual = useProxy(attendanceWidget, "actual", null, FRESHNESS.attendance.poll);
  const todaySchedule = useProxy(scheduleWidget, "schedule", { day: "today" }, FRESHNESS.attendance.poll);
  const tomorrowSchedule = useProxy(scheduleWidget, "schedule", { day: "tomorrow" }, FRESHNESS.tomorrowShift.poll);
  const takada = useSource(attendanceWidget ? "/api/uoattendance/takada" : null, FRESHNESS.attendance.poll);
  const ai = useProxy(sources.aiSummary, "summary", null, FRESHNESS.aiSummary.poll);
  const weatherApi = useProxy(sources.weather, "forecast", null, FRESHNESS.weather.poll);
  const openMeteo = useSource(sources.weather ? null : "/api/tvboard/weather", FRESHNESS.weather.poll);

  // ---- 出荷出力 ----
  const shippingView = useMemo(() => buildShippingView(shipping.data), [shipping.data]);
  const shippingStamp = parseJstStamp(shippingView.updatedAt);
  const shippingState = sourceState(shipping, shippingStamp, FRESHNESS.shipping, nowMs);

  // ---- 楽天 ----
  const ordersView = useMemo(
    () => buildOrdersView({ sales: sales.data, monthly: monthly.data, logos: logos.data, todayYmd: now.ymd }),
    [sales.data, monthly.data, logos.data, now.ymd],
  );
  const salesStamp = parseJstStamp(ordersView.generatedAt);
  const salesState = sourceState(sales, salesStamp, FRESHNESS.rakuten, nowMs);
  const monthState = sourceState(monthly, parseJstStamp(monthly.data?.generatedAtJST), FRESHNESS.monthly, nowMs);

  const attentionView = useMemo(() => buildAttentionView(attention.data, logos.data), [attention.data, logos.data]);
  const attentionState = sourceState(attention, attention.lastOkAt, FRESHNESS.attention, nowMs);
  const attentionStamp = parseJstStamp(attentionView?.generatedAt) ?? attention.lastOkAt;

  // ---- 勤怠 ----
  const todayModel = useMemo(
    () =>
      buildTodayAttendanceModel({
        todaySnapshot: todaySchedule.data?.message?.today ?? todaySchedule.data?.message ?? null,
        actualEmployees: actual.data?.message?.employees || [],
        takadaManualStatus: takada.data?.status || null,
      }),
    [todaySchedule.data, actual.data, takada.data],
  );
  const timeline = useMemo(() => buildShiftTimeline({ todayModel, nowMinutes: now.minutes }), [todayModel, now.minutes]);
  const attendanceStamp =
    scheduleWidget && todaySchedule.lastOkAt != null && actual.lastOkAt != null
      ? Math.min(todaySchedule.lastOkAt, actual.lastOkAt)
      : actual.lastOkAt;
  const attendanceState = sourceState(actual, attendanceStamp, FRESHNESS.attendance, nowMs);

  const tomorrowView = useMemo(
    () => buildTomorrowShifts(tomorrowSchedule.data?.message?.tomorrow ?? tomorrowSchedule.data?.message ?? null),
    [tomorrowSchedule.data],
  );
  const tomorrowState = sourceState(tomorrowSchedule, tomorrowSchedule.lastOkAt, FRESHNESS.tomorrowShift, nowMs);
  const photoBase = attendanceWidget?.photoBaseUrl || attendanceWidget?.scheduleUrl || null;

  // ---- 字幕 ----
  const weatherSource = sources.weather ? weatherApi : openMeteo;
  const weatherState = sourceState(weatherSource, weatherSource.lastOkAt, FRESHNESS.weather, nowMs);
  const weatherView = useMemo(() => {
    if (!weatherSource.data) return null;
    return sources.weather ? buildWeatherViewFromWeatherApi(weatherSource.data) : buildWeatherView(weatherSource.data);
  }, [sources.weather, weatherSource.data]);
  const aiState = ai.data?.state === "stale" ? "delayed" : sourceState(ai, ai.lastOkAt, FRESHNESS.aiSummary, nowMs);
  const segments = useMemo(
    () =>
      buildTickerSegments({
        weather: weatherState === "unavailable" ? null : weatherView,
        ai: ai.data,
      }),
    [weatherState, weatherView, ai.data],
  );

  const statuses = [
    { name: "出荷出力", state: shippingState, detail: lateDetail(shippingState, shippingStamp, nowMs) },
    { name: "楽天", state: salesState, detail: lateDetail(salesState, salesStamp, nowMs) },
    { name: "未対応", state: attentionView?.stale ? "delayed" : attentionState, detail: lateDetail(attentionState, attention.lastOkAt, nowMs) },
    { name: "勤怠", state: attendanceState, detail: lateDetail(attendanceState, attendanceStamp, nowMs) },
    { name: "天気", state: weatherState, detail: lateDetail(weatherState, weatherSource.lastOkAt, nowMs) },
    { name: "AI サマリー", state: aiState, detail: lateDetail(aiState, ai.lastOkAt, nowMs) },
  ];

  return (
    <div className={styles.board}>
      <div className={styles.left}>
        <div className={styles.kpiRow}>
          <OutputCard view={shippingView} state={shippingState} stampMs={shippingStamp} lastOkAt={shipping.lastOkAt} />
          <ShippingCard view={shippingView} state={shippingState} stampMs={shippingStamp} lastOkAt={shipping.lastOkAt} />
          <TomorrowCard view={shippingView} state={shippingState} stampMs={shippingStamp} lastOkAt={shipping.lastOkAt} />
        </div>
        <div className={styles.midRow}>
          <OrdersPanel
            view={ordersView}
            state={salesState}
            stampMs={salesStamp}
            lastOkAt={sales.lastOkAt}
            monthState={monthState}
            todayYmd={now.ymd}
          />
          <div className={styles.midSide}>
            <CourierPanel couriers={shippingView.couriers} state={shippingState} stampMs={shippingStamp} lastOkAt={shipping.lastOkAt} />
            <AttentionPanel view={attentionView} state={attentionState} stampMs={attentionStamp} lastOkAt={attention.lastOkAt} />
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <ShiftTimeline
          timeline={timeline}
          nowMinutes={now.minutes}
          nowMs={nowMs}
          photoBase={photoBase}
          state={attendanceState}
          stampMs={attendanceStamp}
          lastOkAt={actual.lastOkAt}
        />
        <TomorrowShifts view={tomorrowView} state={tomorrowState} photoBase={photoBase} lastOkAt={tomorrowSchedule.lastOkAt} />
      </div>

      <FooterBar clock={clock} axis={timeline.axis} segments={segments} statuses={statuses} />
    </div>
  );
}
