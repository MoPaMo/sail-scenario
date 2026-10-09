"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { Orientation } from "./BoardSvg";

/** Narrow screens get the board turned upright (start at the top), so spaces stay tappable. */
export const VERTICAL_BELOW = 760;

export function useBoardOrientation(): Orientation | null {
  const [orientation, setOrientation] = useState<Orientation | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${VERTICAL_BELOW - 1}px)`);
    let printing = false;
    const update = () => setOrientation(mq.matches && !printing ? "vertical" : "horizontal");
    const beforePrint = () => {
      printing = true;
      flushSync(update);
    };
    const afterPrint = () => {
      printing = false;
      update();
    };
    update();
    mq.addEventListener("change", update);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  return orientation;
}
