import classNames from "classnames";
import { useEffect, useState } from "react";

import { fitStage } from "./display-options.mjs";
import styles from "./tvboard.module.css";

// The board is drawn once at 1920×1080 and scaled into whatever the screen reports: letterboxed
// on the TV, or inside the taskbar/icon margins when it is a desktop wallpaper.
export default function Stage({ display, children }) {
  const [box, setBox] = useState(null);
  const { insets, hideCursor, desktop } = display;

  useEffect(() => {
    function fit() {
      setBox(fitStage(window.innerWidth, window.innerHeight, insets));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [insets]);

  return (
    <div className={classNames(styles.stage, hideCursor && styles.noCursor, desktop && styles.desktopStage)}>
      <div
        className={styles.canvas}
        style={
          box
            ? { transform: `translate(${box.left}px, ${box.top}px) scale(${box.scale})` }
            : { visibility: "hidden" }
        }
      >
        {children}
      </div>
    </div>
  );
}
