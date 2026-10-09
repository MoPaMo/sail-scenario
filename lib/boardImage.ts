import { ALL_CELLS, cellId, endTokenCellIds, parseCell, MAX_COL, ROW_COUNT } from "./board";
import type { Layout } from "./scenario";

/**
 * The board as a standalone SVG string with inline colours, for share images
 * (the image renderer can't use the site's CSS). Same geometry as BoardSvg's
 * horizontal compact view, without labels or spoilers (no route, no dead ends).
 */

const W = 40;
const H = 26;
const PAD_ALONG = 16;
const PAD_ACROSS = 30;
const ACROSS = ROW_COUNT + 1;
const ALONG = MAX_COL + 1;

export const BOARD_IMAGE_WIDTH = 2 * PAD_ALONG + ALONG * W; // 1068
export const BOARD_IMAGE_HEIGHT = 2 * PAD_ACROSS + ACROSS * H; // 268

const C = {
  sea: "#8cc5a1",
  seaDark: "#6aa985",
  grid: "#f3efb2",
  island: "#a4532d",
  islandDark: "#74351a",
  kraken: "#f3d446",
  krakenEdge: "#c2291c",
  teal: "#1d5459",
  cream: "#fff5c4",
  deep: "#0d3135",
  whirl: "#2e6e8e",
  ally: "#efe6cf",
  crow: "#7a4a6e",
};

const p = (along: number, across: number): [number, number] => [PAD_ALONG + along * W, PAD_ACROSS + across * H];
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function diamond(id: string, inset = 1): string {
  const pos = parseCell(id)!;
  const a = pos.r + 1;
  return pts([p(pos.c - inset, a), p(pos.c, a - inset), p(pos.c + inset, a), p(pos.c, a + inset)]);
}

function chevron(tip: string): string {
  const t = parseCell(tip)!;
  const c = t.c;
  const a = t.r + 1;
  return pts([p(c - 1, a - 2), p(c, a - 1), p(c + 1, a), p(c, a + 1), p(c - 1, a + 2), p(c - 2, a + 1), p(c - 1, a), p(c - 2, a - 1)]);
}

const CLOUD = "M-21 8 a9 9 0 0 1 2-17 a11 11 0 0 1 19-5 a10 10 0 0 1 17 6 a8.5 8.5 0 0 1 1 16 z";

export function boardSvgMarkup(l: Layout): string {
  const out: string[] = [];
  const [x0, y0] = p(-0.15, -0.5);
  const [x1, y1] = p(ALONG + 0.15, ACROSS + 0.5);
  out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="14" fill="${C.sea}"/>`);

  // A few swell lines, like the contour pattern on the site.
  for (let i = 0; i < 4; i++) {
    const y = y0 + 34 + i * 52;
    out.push(
      `<path d="M${x0 + 8} ${y} C ${x0 + 180} ${y - 20}, ${x0 + 330} ${y + 20}, ${x0 + 520} ${y} S ${x1 - 200} ${y - 18}, ${x1 - 8} ${y}" fill="none" stroke="${C.seaDark}" stroke-width="1.6" opacity="0.45"/>`,
    );
  }

  for (const pos of ALL_CELLS) {
    out.push(
      `<polygon points="${diamond(cellId(pos.r, pos.c))}" fill="#ffffff" fill-opacity="0.07" stroke="${C.grid}" stroke-opacity="0.85" stroke-width="1.6"/>`,
    );
  }

  for (const col of l.storms) {
    const [sx, sy1] = p(col, 0);
    const [, sy2] = p(col, ACROSS);
    out.push(`<line x1="${sx}" y1="${sy1}" x2="${sx}" y2="${sy2}" stroke="${C.deep}" stroke-width="2.4" stroke-dasharray="7 6" opacity="0.5"/>`);
  }

  for (const id of l.islands) {
    const [cx, cy] = p(parseCell(id)!.c, parseCell(id)!.r + 1);
    out.push(`<polygon points="${diamond(id, 0.88)}" fill="${C.island}" stroke="${C.islandDark}" stroke-width="1.8" stroke-linejoin="round"/>`);
    out.push(`<ellipse cx="${cx - 13}" cy="${cy - 5}" rx="6" ry="3.5" fill="${C.islandDark}" opacity="0.45"/>`);
    out.push(`<ellipse cx="${cx + 14}" cy="${cy + 6}" rx="4" ry="2.5" fill="${C.islandDark}" opacity="0.45"/>`);
  }
  const piece = (ids: string[], fill: string, stroke: string, width: number) =>
    ids.forEach((id) =>
      out.push(`<polygon points="${diamond(id, 0.86)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`),
    );
  piece(l.kraken, C.kraken, C.krakenEdge, 3);
  piece(l.whirlpools, C.whirl, "#bfe6f5", 1.8);
  piece(l.allies, C.ally, C.teal, 2);
  piece(l.crowsNests, C.crow, "#f0d6e8", 1.8);
  if (l.start) {
    out.push(`<polygon points="${diamond(l.start, 0.92)}" fill="${C.teal}" stroke="${C.cream}" stroke-width="2" stroke-linejoin="round"/>`);
  }
  if (l.end && endTokenCellIds(l.end).length === 3) {
    out.push(`<polygon points="${chevron(l.end)}" fill="${C.teal}" stroke="${C.cream}" stroke-width="2.4" stroke-linejoin="round"/>`);
  }

  for (const col of l.storms) {
    for (const across of [-0.5 + 0.31, ACROSS + 0.5 + 0.31]) {
      const [cx, cy] = p(col, across);
      out.push(
        `<path transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(0.85)" d="${CLOUD}" fill="${C.teal}" stroke="${C.cream}" stroke-width="2" stroke-linejoin="round"/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_IMAGE_WIDTH} ${BOARD_IMAGE_HEIGHT}" width="${BOARD_IMAGE_WIDTH}" height="${BOARD_IMAGE_HEIGHT}">${out.join("")}</svg>`;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Small token glyphs for the stats row of share images. */
export const ICONS = {
  island: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 29" width="40" height="29"><polygon points="20,1.5 38.5,14.5 20,27.5 1.5,14.5" fill="${C.island}" stroke="${C.islandDark}" stroke-width="1.6"/><ellipse cx="14" cy="12" rx="5" ry="3" fill="${C.islandDark}" opacity="0.5"/></svg>`,
  kraken: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 29" width="40" height="29"><polygon points="20,2.5 37.5,14.5 20,26.5 2.5,14.5" fill="${C.kraken}" stroke="${C.krakenEdge}" stroke-width="2.8"/></svg>`,
  storm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -26 46 36" width="46" height="36"><path d="${CLOUD}" fill="${C.teal}" stroke="${C.cream}" stroke-width="2.2"/></svg>`,
  mark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><polygon points="13,1.5 26,10.5 38.5,20 26,29.5 13,38.5 1.5,29.5 13,20 1.5,10.5" fill="${C.teal}" stroke="${C.cream}" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
};
