"use client";

import type { Layout } from "@/lib/scenario";
import BoardSvg from "./BoardSvg";
import { useBoardOrientation } from "./useBoardOrientation";

/** Read-only board that turns upright on narrow screens and lies flat for printing. */
export default function BoardViewer({ layout, route, traps, label }: { layout: Layout; route?: string[] | null; traps?: string[]; label: string }) {
  const orientation = useBoardOrientation();
  return (
    <div className={`board-frame board-frame--view${orientation === "vertical" ? " board-frame--vertical" : ""}`}>
      {orientation ? (
        <BoardSvg layout={layout} orientation={orientation} route={route} traps={traps} label={label} />
      ) : (
        <div className="board-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
