// A platform's own mark beside its shops and its name, so a board that mixes
// platforms reads at a glance. The glyphs are inline SVG from react-icons (nothing
// is fetched), each on its brand's tile colour like its app icon, which keeps them
// legible on light and dark themes alike. A faint ring keeps Amazon's navy tile
// apart from a dark page. react-icons has no au PAY glyph: its "au" is set in type.
import { FaAmazon } from "react-icons/fa6";
import { SiRakuten } from "react-icons/si";

const MARKS = {
  rakuten: { Icon: SiRakuten, tile: "#BF0000", glyph: "#FFFFFF" },
  amazon: { Icon: FaAmazon, tile: "#232F3E", glyph: "#FF9900" },
  aupay: { text: "au", tile: "#EB5505", glyph: "#FFFFFF" },
};

// The mark is decorative: wherever it stands, the platform's name is written
// beside it or given to screen readers (see PlatformName / PlatformSuffix).
export function PlatformMark({ platform, size = 14 }) {
  const mark = MARKS[platform];
  if (!mark) return null;
  const { Icon, text, tile, glyph } = mark;
  return (
    <span
      aria-hidden="true"
      data-platform={platform}
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] align-[-0.15em] ring-1 ring-black/10 dark:ring-white/30"
      style={{ width: size, height: size, backgroundColor: tile }}
    >
      {Icon ? (
        <Icon style={{ width: size * 0.7, height: size * 0.7, color: glyph }} />
      ) : (
        <span className="font-extrabold leading-none" style={{ fontSize: size * 0.6, color: glyph }}>
          {text}
        </span>
      )}
    </span>
  );
}

// the mark, then the platform's name as it is written on the page
export function PlatformName({ platform, label, size }) {
  return (
    <span className="inline-flex items-center gap-1">
      <PlatformMark platform={platform} size={size} />
      {label}
    </span>
  );
}

// A section that is 楽天's alone says so in its title once another platform is on
// the page: `scope` is that label, empty while 楽天 is the only platform.
export function ScopeName({ scope, size }) {
  if (!scope) return null;
  return (
    <>
      <PlatformName platform="rakuten" label={scope} size={size} />{" "}
    </>
  );
}

// For a shop: the mark leads (so a column of them lines up) but the name is the
// shop's, so the platform is only read out after it.
export function PlatformSuffix({ label }) {
  return <span className="sr-only">{label}</span>;
}
