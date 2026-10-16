const known = (value) => typeof value === "number" && Number.isFinite(value);

// A number only animates when one known value replaces another; the first load and a value
// coming back from "unknown" stay still. Only a rise earns a "+N" chip.
export function numberEffect(prev, next) {
  if (!known(prev) || !known(next) || prev === next) {
    return { animate: false, delta: null };
  }
  return { animate: true, delta: next > prev ? next - prev : null };
}
