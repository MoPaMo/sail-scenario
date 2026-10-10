import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { ALL_CELLS, cellId, endTokenCellIds, parseCell, MAX_COL, ROW_COUNT } from "@/lib/board";
import type { Layout } from "@/lib/scenario";
import type { Tool } from "@/lib/tokens";

export type Orientation = "horizontal" | "vertical";

export interface BoardGhost {
  tool: Tool;
  cells: string[];
  column?: number;
  valid: boolean;
}

export interface BoardSvgProps {
  layout: Layout;
  orientation: Orientation;
  label: string;
  compact?: boolean;
  route?: string[] | null;
  /** Round of each move along `route` (route[i + 1] is reached in routeRounds[i]); marks where rounds end. */
  routeRounds?: number[] | null;
  traps?: string[];
  ghost?: BoardGhost | null;
  interactive?: boolean;
  activeCell?: string | null;
  onCellPointerDown?: (id: string, e: PointerEvent<SVGGElement>) => void;
  onCellPointerEnter?: (id: string, e: PointerEvent<SVGGElement>) => void;
  onCellPointerLeave?: (id: string) => void;
  onCellClick?: (id: string, e: MouseEvent<SVGGElement>) => void;
  onCellKeyDown?: (id: string, e: KeyboardEvent<SVGGElement>) => void;
  onCellFocus?: (id: string, e: FocusEvent<SVGGElement>) => void;
  onStormClick?: (column: number) => void;
  cellRef?: (id: string, el: SVGGElement | null) => void;
}

// Half a diamond along the sailing direction (W) and across it (H).
const W = 40;
const H = 26;
const PAD_ALONG = 16;
const ACROSS_UNITS = ROW_COUNT + 1; // A sits on 1, G on 7; vertices span 0–8
const ALONG_UNITS = MAX_COL + 1;

type Pt = [number, number];

function makeGeometry(orientation: Orientation, compact: boolean) {
  const padAcross = compact ? 26 : 46;
  // Upright = the printed board turned a quarter clockwise: Start at the top, row A on the right.
  // (Turn the phone back to landscape and row A is on top again, as in the scenario book.)
  const p = (along: number, across: number): Pt =>
    orientation === "horizontal"
      ? [PAD_ALONG + along * W, padAcross + across * H]
      : [padAcross + (ACROSS_UNITS - across) * H, PAD_ALONG + along * W];
  const width = orientation === "horizontal" ? 2 * PAD_ALONG + ALONG_UNITS * W : 2 * padAcross + ACROSS_UNITS * H;
  const height = orientation === "horizontal" ? 2 * padAcross + ACROSS_UNITS * H : 2 * PAD_ALONG + ALONG_UNITS * W;
  return { p, width, height };
}

const pts = (list: Pt[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export default function BoardSvg({
  layout,
  orientation,
  label,
  compact = false,
  route,
  routeRounds,
  traps = [],
  ghost,
  interactive = false,
  activeCell,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellClick,
  onCellKeyDown,
  onCellFocus,
  onStormClick,
  cellRef,
}: BoardSvgProps) {
  const { p, width, height } = makeGeometry(orientation, compact);
  const uid = `${orientation}${compact ? "c" : ""}`;

  const diamond = (id: string, inset = 1): string => {
    const pos = parseCell(id)!;
    const a = pos.r + 1;
    return pts([p(pos.c - inset, a), p(pos.c, a - inset), p(pos.c + inset, a), p(pos.c, a + inset)]);
  };
  const center = (id: string): Pt => {
    const pos = parseCell(id)!;
    return p(pos.c, pos.r + 1);
  };
  const chevron = (tip: string): string => {
    const t = parseCell(tip)!;
    const c = t.c;
    const a = t.r + 1;
    return pts([
      p(c - 1, a - 2),
      p(c, a - 1),
      p(c + 1, a),
      p(c, a + 1),
      p(c - 1, a + 2),
      p(c - 2, a + 1),
      p(c - 1, a),
      p(c - 2, a - 1),
    ]);
  };

  const [bx0, by0] = p(-0.15, -0.5);
  const [bx1, by1] = p(ALONG_UNITS + 0.15, ACROSS_UNITS + 0.5);
  const bg = { x: Math.min(bx0, bx1), y: Math.min(by0, by1), w: Math.abs(bx1 - bx0), h: Math.abs(by1 - by0) };

  const endCells = layout.end ? endTokenCellIds(layout.end) : [];
  const tokenCells = new Map<string, string>();
  if (layout.start) tokenCells.set(layout.start, "start");
  endCells.forEach((id) => tokenCells.set(id, "end"));
  layout.islands.forEach((id) => tokenCells.set(id, "island"));
  layout.kraken.forEach((id) => tokenCells.set(id, "kraken"));
  layout.whirlpools.forEach((id) => tokenCells.set(id, "whirlpool"));
  layout.allies.forEach((id) => tokenCells.set(id, "ally"));
  layout.crowsNests.forEach((id) => tokenCells.set(id, "crowsNest"));

  const routeKraken = new Set((route ?? []).filter((id) => layout.kraken.includes(id)));
  const labelSize = compact ? 0 : 11;

  // Clouds straddle the long edges of the board, like the printed storm tokens.
  const cloudPositions = (col: number): Pt[] => {
    const lift = orientation === "horizontal" ? 0.31 : 0;
    return [p(col, -0.5 + lift), p(col, ACROSS_UNITS + 0.5 + lift)];
  };
  const cloudShape = (x: number, y: number, ghostCloud = false) => (
    <g
      className={ghostCloud ? "storm-cloud storm-cloud--ghost" : "storm-cloud"}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${compact ? 0.7 : 1})`}
    >
      <path d="M-21 8 a9 9 0 0 1 2-17 a11 11 0 0 1 19-5 a10 10 0 0 1 17 6 a8.5 8.5 0 0 1 1 16 z" />
    </g>
  );
  const cloud = (col: number, key: string, ghostCloud = false) =>
    cloudPositions(col).map(([x, y], i) => <g key={`${key}-${i}`}>{cloudShape(x, y, ghostCloud)}</g>);

  return (
    <svg
      className={`board board--${orientation}${compact ? " board--compact" : ""}${interactive ? " board--interactive" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role={interactive ? "grid" : "img"}
      aria-label={label}
    >
      <defs>
        <pattern id={`contours-${uid}`} width="180" height="120" patternUnits="userSpaceOnUse">
          <path
            d="M-10 30 C30 10 60 50 100 30 S170 10 190 30 M-10 70 C25 55 70 90 110 70 S165 50 190 70 M-10 105 C35 95 60 120 105 108 S160 92 190 108"
            fill="none"
            className="contour"
          />
        </pattern>
        <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" className="hatch-line" />
        </pattern>
      </defs>

      {/* Sea */}
      <rect className="sea" x={bg.x} y={bg.y} width={bg.w} height={bg.h} rx={compact ? 8 : 14} />
      <rect x={bg.x} y={bg.y} width={bg.w} height={bg.h} rx={compact ? 8 : 14} fill={`url(#contours-${uid})`} />

      {/* Grid */}
      <g className="grid">
        {ALL_CELLS.map((pos) => {
          const id = cellId(pos.r, pos.c);
          return <polygon key={id} points={diamond(id)} />;
        })}
      </g>

      {/* Storm lines */}
      {layout.storms.map((col) => {
        const [x1, y1] = p(col, 0);
        const [x2, y2] = p(col, ACROSS_UNITS);
        return <line key={`sl-${col}`} className="storm-line" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}

      {/* Tokens */}
      <g className="tokens">
        {layout.islands.map((id) => {
          const [x, y] = center(id);
          const s = orientation === "horizontal" ? 1 : 0.8;
          return (
            <g key={`i-${id}`} className="token token--island">
              <polygon points={diamond(id, 0.88)} />
              {!compact && (
                <>
                  <ellipse className="island-blot" cx={x - 13 * s} cy={y - 5} rx={6 * s} ry={3.5} />
                  <ellipse className="island-blot" cx={x + 14 * s} cy={y + 6} rx={4 * s} ry={2.5} />
                </>
              )}
            </g>
          );
        })}
        {layout.kraken.map((id) => (
          <polygon key={`k-${id}`} className="token token--kraken" points={diamond(id, 0.86)} />
        ))}
        {layout.whirlpools.map((id) => (
          <polygon key={`w-${id}`} className="token token--whirlpool" points={diamond(id, 0.86)} />
        ))}
        {layout.allies.map((id) => (
          <polygon key={`a-${id}`} className="token token--ally" points={diamond(id, 0.86)} />
        ))}
        {layout.crowsNests.map((id) => (
          <polygon key={`c-${id}`} className="token token--crowsNest" points={diamond(id, 0.86)} />
        ))}
        {layout.start && <polygon className="token token--start" points={diamond(layout.start, 0.92)} />}
        {layout.end && endCells.length === 3 && <polygon className="token token--end" points={chevron(layout.end)} />}
      </g>

      {/* Dead ends */}
      {traps.length > 0 && (
        <g className="traps">
          {traps.map((id) => (
            <polygon key={`t-${id}`} points={diamond(id, 0.92)} fill={`url(#hatch-${uid})`} />
          ))}
        </g>
      )}

      {/* Route */}
      {route && route.length > 1 && (
        <g className="route">
          <polyline points={pts(route.map(center))} className="route-casing" />
          <polyline points={pts(route.map(center))} className="route-line" />
          {route.slice(1).map((id) => {
            const [x, y] = center(id);
            return <circle key={`r-${id}`} cx={x} cy={y} r={routeKraken.has(id) ? 9 : 3.2} className={routeKraken.has(id) ? "route-hit" : "route-dot"} />;
          })}
          {routeRounds &&
            routeRounds.map((round, i) => {
              const last = i === routeRounds.length - 1;
              if (last || routeRounds[i + 1] === round) return null;
              const [x, y] = center(route[i + 1]);
              const off = compact ? 0 : 15;
              return (
                <g key={`rr-${i}`} className="round-mark" transform={`translate(${x + off} ${y - off})`}>
                  <title>{`End of round ${round} in the best case`}</title>
                  <circle r={compact ? 6 : 8.5} />
                  <text y={compact ? 2.5 : 3.5}>{round}</text>
                </g>
              );
            })}
        </g>
      )}

      {/* Labels */}
      {labelSize > 0 && (
        <g className="labels">
          {ALL_CELLS.map((pos) => {
            const id = cellId(pos.r, pos.c);
            const [x, y] = center(id);
            const kind = tokenCells.get(id);
            return (
              <g key={`l-${id}`}>
                {kind === "start" && (
                  <text x={x} y={y - 9} className="label label--tag">
                    START
                  </text>
                )}
                <text x={x} y={y + (kind === "start" ? 6 : 4)} className={`label${kind ? ` label--${kind}` : ""}`}>
                  {id}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Hit areas (interactive layer, on top so hover and focus rings show over tokens) */}
      {interactive && (
        <g className="cells">
          {ALL_CELLS.map((pos) => {
            const id = cellId(pos.r, pos.c);
            const kind = tokenCells.get(id);
            return (
              <g
                key={`h-${id}`}
                ref={cellRef ? (el) => cellRef(id, el) : undefined}
                className="cell"
                role="gridcell"
                tabIndex={id === activeCell ? 0 : -1}
                aria-label={`${id}${kind ? `, ${kind === "crowsNest" ? "crow's nest" : kind === "ally" ? "ally ship" : kind}` : ", open sea"}`}
                onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(id, e) : undefined}
                onPointerEnter={onCellPointerEnter ? (e) => onCellPointerEnter(id, e) : undefined}
                onPointerLeave={onCellPointerLeave ? () => onCellPointerLeave(id) : undefined}
                onClick={onCellClick ? (e) => onCellClick(id, e) : undefined}
                onKeyDown={onCellKeyDown ? (e) => onCellKeyDown(id, e) : undefined}
                onFocus={onCellFocus ? (e) => onCellFocus(id, e) : undefined}
              >
                <polygon className="hit" points={diamond(id, 0.97)} />
              </g>
            );
          })}
        </g>
      )}

      {/* Placement preview */}
      {ghost && ghost.tool !== "storm" && ghost.cells.length > 0 && (
        <g className={`ghost ghost--${ghost.tool}${ghost.valid ? "" : " ghost--invalid"}`}>
          {ghost.tool === "end" && ghost.cells.length === 3 && ghost.valid ? (
            <polygon points={chevron(ghost.cells[2])} />
          ) : (
            ghost.cells.map((id) => <polygon key={`g-${id}`} points={diamond(id, 0.9)} />)
          )}
        </g>
      )}

      {/* Storm clouds */}
      <g className="storms">
        {ghost?.tool === "storm" && ghost.column !== undefined && !layout.storms.includes(ghost.column) && ghost.valid &&
          cloud(ghost.column, "ghost", true)}
        {layout.storms.map((col) =>
          onStormClick ? (
            // One button per cloud so each is clickable where it's drawn; only the first is in the tab order.
            cloudPositions(col).map(([x, y], i) => (
              <g
                key={`s-${col}-${i}`}
                className="storm storm--removable"
                role="button"
                tabIndex={i === 0 ? 0 : -1}
                aria-hidden={i === 0 ? undefined : true}
                aria-label={i === 0 ? `Storm on column ${col}. Remove` : undefined}
                onClick={() => onStormClick(col)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStormClick(col);
                  }
                }}
              >
                {cloudShape(x, y)}
              </g>
            ))
          ) : (
            <g key={`s-${col}`} className="storm">
              {cloud(col, `s-${col}`)}
            </g>
          ),
        )}
      </g>
    </svg>
  );
}
