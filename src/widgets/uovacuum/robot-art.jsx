/*
 * The robot seen from above, ported from the Claude Design canvas (StripPlus.dc.html):
 * white body, lidar turret, bumper seam, side brushes, a battery ring and the dock.
 * The wrapper's `uovac-is-<status>` class drives every animation; ART_STYLES must be
 * rendered once by the card.
 */
import { useId } from "react";

export const ACCENT = "#5eead4";
export const AMBER = "#fcd34d";
export const ROSE = "#fb7185";
export const CALM = "#cbd5e1";

export const STATUS_TONE = {
  docked: ACCENT,
  charging: AMBER,
  preparing: ACCENT,
  washingMidway: ACCENT,
  cleaning: ACCENT,
  paused: CALM,
  returning: ACCENT,
  idle: CALM,
  error: ROSE,
  offline: CALM,
};

const RING_LENGTH = 2 * Math.PI * 64;
const LANES = "M16 20 H184 V44 H16 V68 H184 V92 H16 V116 H184 V140 H16 V164 H184";

export const ART_STYLES = `
.uovac-track{fill:none;stroke:rgba(255,255,255,.09);stroke-width:3}
.uovac-arc{fill:none;stroke-width:3;stroke-linecap:round;transition:stroke-dasharray .6s ease}
.uovac-is-charging .uovac-arc{animation:uovac-charge 2.4s ease-in-out infinite}
.uovac-bristle{fill:none;stroke:#8d97a4;stroke-width:1.4;stroke-linecap:round}
.uovac-brush{transform-box:fill-box;transform-origin:center}
.uovac-is-cleaning .uovac-brush{animation:uovac-spin .6s linear infinite}
.uovac-seam{fill:none;stroke:rgba(15,23,42,.16);stroke-width:1.2}
.uovac-window{fill:none;stroke:#2a313b;stroke-width:3.2;stroke-linecap:round}
.uovac-turret{fill:#222932;stroke:#3a4350;stroke-width:1.5}
.uovac-turret-in{fill:#2c3440}
.uovac-key{fill:#b7bfc9}
.uovac-sweep{transform-box:view-box;transform-origin:100px 78px;opacity:0;transition:opacity .5s}
.uovac-is-cleaning .uovac-sweep{opacity:1;animation:uovac-spin 2.8s linear infinite}
.uovac-lanes{fill:none;opacity:0;transition:opacity .8s}
.uovac-is-cleaning .uovac-lanes{opacity:1}
.uovac-lane{stroke-width:15;stroke-opacity:.07;stroke-linecap:round;stroke-linejoin:round}
.uovac-lane-line{stroke-width:1.2;stroke-opacity:.4;stroke-dasharray:2 7;stroke-linecap:round;animation:uovac-flow 1.4s linear infinite}
.uovac-dock{opacity:.4;transition:opacity .5s}
.uovac-is-docked .uovac-dock,.uovac-is-charging .uovac-dock,.uovac-is-returning .uovac-dock,.uovac-is-preparing .uovac-dock,.uovac-is-washingMidway .uovac-dock{opacity:1}
.uovac-dock-body{fill:#3a4350;stroke:rgba(255,255,255,.08)}
.uovac-contact{fill:rgba(255,255,255,.2)}
.uovac-is-docked .uovac-contact,.uovac-is-charging .uovac-contact{fill:${AMBER}}
.uovac-is-returning .uovac-contact{animation:uovac-blink 1s ease-in-out infinite}
.uovac-is-preparing .uovac-contact,.uovac-is-washingMidway .uovac-contact{animation:uovac-blink-accent 1.4s ease-in-out infinite}
.uovac-is-cleaning .uovac-led,.uovac-is-preparing .uovac-led,.uovac-is-washingMidway .uovac-led,.uovac-dot-live{animation:uovac-pulse 1.6s ease-in-out infinite}
.uovac-ping{fill:none;stroke-width:2;opacity:0;transform-box:view-box;transform-origin:100px 92px}
.uovac-is-locating .uovac-ping{animation:uovac-ping 1.2s ease-out infinite}
.uovac-is-offline{opacity:.45;filter:grayscale(1)}
.uovac-floor path{fill:none;stroke-width:1.2;stroke-opacity:.22;stroke-dasharray:2 8;stroke-linecap:round;animation:uovac-flow-wide 2.4s linear infinite}
.uovac-arm-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;background:rgba(8,32,29,.55);transform-origin:left;animation:uovac-shrink 3s linear forwards}
@keyframes uovac-spin{to{transform:rotate(360deg)}}
@keyframes uovac-flow{to{stroke-dashoffset:-18}}
@keyframes uovac-flow-wide{to{stroke-dashoffset:-40}}
@keyframes uovac-pulse{50%{opacity:.25}}
@keyframes uovac-blink{50%{fill:${AMBER}}}
@keyframes uovac-blink-accent{50%{fill:${ACCENT}}}
@keyframes uovac-charge{50%{stroke-opacity:.45}}
@keyframes uovac-shrink{to{transform:scaleX(0)}}
@keyframes uovac-ping{0%{opacity:.7;transform:scale(.8)}100%{opacity:0;transform:scale(1.5)}}
@media (prefers-reduced-motion: reduce){.uovac *{animation:none!important}}
`;

export default function RobotArt({ status, battery, locating }) {
  // useId() contains characters that do not survive inside url(#…)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tone = STATUS_TONE[status] ?? CALM;
  const ring = status === "error" ? ROSE : ACCENT;
  const filled = Number.isFinite(battery) ? (RING_LENGTH * Math.max(0, Math.min(100, battery))) / 100 : 0;
  const classes = ["uovac-art", status && `uovac-is-${status}`, locating && "uovac-is-locating"].filter(Boolean);

  return (
    <div className={classes.join(" ")} style={{ width: "100%", height: "100%" }}>
      <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%", display: "block" }} aria-hidden="true">
        <defs>
          <pattern id={`${uid}-dots`} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="0.9" style={{ fill: "rgba(255,255,255,0.10)" }} />
          </pattern>
          <radialGradient id={`${uid}-body`} cx="0.42" cy="0.36" r="0.75">
            <stop offset="0" style={{ stopColor: "#fbfcfd" }} />
            <stop offset="0.7" style={{ stopColor: "#e3e8ee" }} />
            <stop offset="1" style={{ stopColor: "#c3cbd5" }} />
          </radialGradient>
          <radialGradient id={`${uid}-beam`} cx="100" cy="78" r="96" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: ACCENT, stopOpacity: 0.55 }} />
            <stop offset="0.55" style={{ stopColor: ACCENT, stopOpacity: 0.16 }} />
            <stop offset="1" style={{ stopColor: ACCENT, stopOpacity: 0 }} />
          </radialGradient>
          <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <rect x="0" y="0" width="200" height="200" style={{ fill: `url(#${uid}-dots)` }} />
        <g className="uovac-lanes" style={{ stroke: ACCENT }}>
          <path className="uovac-lane" d={LANES} />
          <path className="uovac-lane-line" d={LANES} />
        </g>
        <g className="uovac-dock">
          <rect className="uovac-dock-body" x="66" y="168" width="68" height="14" rx="5" />
          <rect className="uovac-contact" x="80" y="164" width="10" height="3" rx="1.5" />
          <rect className="uovac-contact" x="110" y="164" width="10" height="3" rx="1.5" />
        </g>
        <circle className="uovac-track" cx="100" cy="92" r="64" />
        <circle
          className="uovac-arc"
          cx="100"
          cy="92"
          r="64"
          transform="rotate(-90 100 92)"
          style={{ stroke: ring, strokeDasharray: `${filled.toFixed(1)} ${RING_LENGTH.toFixed(1)}` }}
        />
        <circle className="uovac-ping" cx="100" cy="92" r="58" style={{ stroke: ACCENT }} />
        <circle cx="100" cy="98" r="48" filter={`url(#${uid}-shadow)`} style={{ fill: "rgba(0,0,0,0.45)" }} />
        <g className="uovac-brush">
          <path className="uovac-bristle" d="M65.4 44.4 V70.4 M54.1 50.9 L76.7 63.9 M54.1 63.9 L76.7 50.9" />
        </g>
        <g className="uovac-brush">
          <path className="uovac-bristle" d="M134.6 44.4 V70.4 M123.3 50.9 L145.9 63.9 M123.3 63.9 L145.9 50.9" />
        </g>
        <circle cx="100" cy="92" r="50" style={{ fill: `url(#${uid}-body)` }} />
        <path className="uovac-seam" d="M59.3 68.5 A47 47 0 0 1 140.7 68.5" />
        <path className="uovac-window" d="M86.6 45.4 A48.5 48.5 0 0 1 113.4 45.4" />
        <g className="uovac-sweep">
          <path d="M100 78 L100 -18 A96 96 0 0 1 167.9 10.1 Z" style={{ fill: `url(#${uid}-beam)` }} />
        </g>
        <circle className="uovac-turret" cx="100" cy="78" r="15" />
        <circle className="uovac-turret-in" cx="100" cy="78" r="9" />
        <circle cx="100" cy="69.5" r="1.8" style={{ fill: tone }} />
        <rect className="uovac-key" x="91" y="104" width="18" height="5" rx="2.5" />
        <circle className="uovac-led" cx="100" cy="117" r="2.2" style={{ fill: tone }} />
      </svg>
    </div>
  );
}
