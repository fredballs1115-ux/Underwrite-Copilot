"use client";

import { useEffect, useState } from "react";

/** A hairline reading-progress bar pinned to the top of the viewport —
 *  accent-colored so it reads on both the dark hero and the light body.
 *  Pure position math on scroll; no animation loop, so reduced motion
 *  needs no branch (the bar simply sits where the reader is). */
export function ScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="scroll-progress pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div
        className="h-full rounded-r-full bg-accent/90"
        style={{ width: `${p * 100}%` }}
      />
    </div>
  );
}
