import { useEffect, useState } from "react";

import styles from "./tvboard.module.css";

const WIDTH = 1920;
const HEIGHT = 1080;

// The board is drawn once at 1920×1080 and scaled to whatever the TV reports, letterboxed.
export default function Stage({ children }) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    function fit() {
      const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
      setBox({
        scale,
        left: (window.innerWidth - WIDTH * scale) / 2,
        top: (window.innerHeight - HEIGHT * scale) / 2,
      });
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className={styles.stage}>
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
