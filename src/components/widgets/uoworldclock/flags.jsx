import { useId } from "react";

// Windows 的 Segoe UI Emoji 不收录国旗字形，会把 🇯🇵 原样降级成「JP」两个字母。
// 内联 SVG 既绕开这个限制，也避免了各平台 emoji 国旗造型不一致的问题。
const FLAG_HEIGHT = 12;

// 白底旗帜在深色背景上需要一圈描边才有边界
const frameClass = "rounded-[1px] ring-1 ring-black/25";

function JapanFlag() {
  return (
    <svg viewBox="0 0 900 600" width={18} height={FLAG_HEIGHT} className={frameClass} aria-hidden="true">
      <rect width="900" height="600" fill="#fff" />
      <circle cx="450" cy="300" r="180" fill="#bc002d" />
    </svg>
  );
}

function UnitedKingdomFlag() {
  // useId 的原始值形如 ":r0:"，冒号在 url(#...) 中会被当作伪类解析，必须清洗
  const uid = useId().replace(/:/g, "");
  const frameId = `${uid}-frame`;
  const diagonalId = `${uid}-diagonal`;

  return (
    <svg viewBox="0 0 60 30" width={24} height={FLAG_HEIGHT} className={frameClass} aria-hidden="true">
      <clipPath id={frameId}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={diagonalId}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${frameId})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${diagonalId})`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

// 新增国家只需在此登记一行，组件与配置都不必改动
const flagComponents = {
  jp: JapanFlag,
  gb: UnitedKingdomFlag,
};

// 调用方需要在渲染前就知道 code 认不认得——<Flag /> 元素本身始终为真值，
// 拿它做判断会让未知 code 既不出国旗、也不回退到文字。
export function hasFlag(code) {
  return Boolean(code && flagComponents[code]);
}

export default function Flag({ code }) {
  const FlagComponent = flagComponents[code];
  return FlagComponent ? <FlagComponent /> : null;
}
