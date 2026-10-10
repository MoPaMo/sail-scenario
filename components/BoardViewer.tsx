"use client";

import type { Layout } from "@/lib/scenario";
import BoardSvg from "./BoardSvg";
import { useBoardOrientation } from "./useBoardOrientation";

/** Read-only board that turns upright on narrow screens and lies flat for printing. */
export default function BoardViewer({
  id,
  layout,
  route,
  routeRounds,
  traps,
  label,
}: {
  id?: string;
  layout: Layout;
  route?: string[] | null;
  routeRounds?: number[] | null;
  traps?: string[];
  label: string;
}) {
  const orientation = useBoardOrientation();
  return (
    <div id={id} className={`board-frame board-frame--view${orientation === "vertical" ? " board-frame--vertical" : ""}`}>
      {orientation ? (
        <BoardSvg layout={layout} orientation={orientation} route={route} routeRounds={routeRounds} traps={traps} label={label} />
      ) : (
        <div className="board-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
