import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BOARD_IMAGE_HEIGHT, BOARD_IMAGE_WIDTH, ICONS, boardSvgMarkup, svgDataUri } from "./boardImage";
import type { Layout } from "./scenario";

/**
 * Share images (Open Graph / Twitter cards), 1200×630 PNG.
 * Layout: brand line, title, a stats row, and the map filling the lower half,
 * so the card is recognisable even as a small thumbnail in a chat app.
 */

export const SHARE_SIZE = { width: 1200, height: 630 };

const COLORS = { deep: "#0d3135", cream: "#fff5c4", text: "#e4f2e9", dim: "#a6c8b9", line: "#2c6a6f" };
const BOARD_W = 1088;
const BOARD_H = Math.round((BOARD_W * BOARD_IMAGE_HEIGHT) / BOARD_IMAGE_WIDTH);

type FontSpec = { name: string; data: Buffer; weight: 500 | 700; style: "normal" };
let fontsPromise: Promise<FontSpec[]> | null = null;

/**
 * Barlow Condensed (SIL OFL). The latin-ext subset is registered under its own
 * family name and listed second in font-family, so letters like ł, č, ş, ő
 * fall back to it (the renderer only falls back between differently named fonts).
 */
const FAMILY = "Barlow Condensed, Barlow Condensed Ext";

function loadFonts(): Promise<FontSpec[]> {
  fontsPromise ??= Promise.all(
    (["latin", "latin-ext"] as const).flatMap((subset) =>
      ([500, 700] as const).map(async (weight) => ({
        name: subset === "latin" ? "Barlow Condensed" : "Barlow Condensed Ext",
        data: await readFile(join(process.cwd(), "assets/fonts", `barlow-condensed-${subset}-${weight}-normal.woff`)),
        weight,
        style: "normal" as const,
      })),
    ),
  );
  return fontsPromise;
}

function titleSize(title: string): number {
  if (title.length <= 24) return 80;
  if (title.length <= 40) return 66;
  return 56;
}

function Brand({ right }: { right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUri(ICONS.mark)} width={34} height={34} alt="" />
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: COLORS.cream }}>Sail</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: COLORS.dim }}>Scenario Workshop</div>
      </div>
      {right && <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: COLORS.dim }}>{right}</div>}
    </div>
  );
}

function Board({ layout }: { layout: Layout }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUri(boardSvgMarkup(layout))} width={BOARD_W} height={BOARD_H} alt="" style={{ marginTop: "auto" }} />;
}

function Stat({ icon, value, w = 34, h = 25 }: { icon: string; value: string | number; w?: number; h?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUri(icon)} width={w} height={h} alt="" />
      <div style={{ display: "flex" }}>{String(value)}</div>
    </div>
  );
}

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  padding: "48px 56px 44px",
  background: COLORS.deep,
  fontFamily: FAMILY,
  borderBottom: `10px solid ${COLORS.cream}`,
};

const cacheHeaders = (maxAge: number) => ({
  "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge * 24}, stale-while-revalidate=604800`,
});

export async function scenarioShareImage(s: {
  title: string;
  author: string;
  layout: Layout;
  columns: number;
  host: string;
  /** Difficulty label and colour, when known. */
  level?: { label: string; color: string };
}): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const size = titleSize(s.title);
  return new ImageResponse(
    (
      <div style={frame}>
        <Brand right={s.host} />
        <div
          style={{
            display: "flex",
            marginTop: 22,
            maxHeight: size * 2.1,
            overflow: "hidden",
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.02,
            color: COLORS.cream,
          }}
        >
          {s.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 16, fontSize: 32, fontWeight: 500, color: COLORS.text }}>
          <div style={{ display: "flex" }}>{s.author ? `by ${s.author}` : "Custom scenario"}</div>
          <Stat icon={ICONS.island} value={s.layout.islands.length} />
          <Stat icon={ICONS.kraken} value={s.layout.kraken.length} />
          <Stat icon={ICONS.storm} value={s.layout.storms.length} w={36} h={28} />
          <div style={{ display: "flex", color: COLORS.dim }}>{`${s.columns} columns`}</div>
          {s.level && (
            <div
              style={{
                display: "flex",
                padding: "4px 16px 6px",
                borderRadius: 999,
                background: s.level.color,
                color: COLORS.deep,
                fontWeight: 700,
                fontSize: 28,
              }}
            >
              {s.level.label}
            </div>
          )}
        </div>
        <Board layout={s.layout} />
      </div>
    ),
    { ...SHARE_SIZE, fonts, headers: cacheHeaders(3600) },
  );
}

export async function siteShareImage(sample: Layout, host: string): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div style={frame}>
        <Brand right={host} />
        <div style={{ display: "flex", marginTop: 26, fontSize: 82, fontWeight: 700, lineHeight: 1, color: COLORS.cream }}>
          Design your own Sail scenarios
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 34, fontWeight: 500, color: COLORS.dim }}>
          Islands, krakens and storms from the box. Check the course, print the card, share it.
        </div>
        <Board layout={sample} />
      </div>
    ),
    { ...SHARE_SIZE, fonts, headers: cacheHeaders(86400) },
  );
}
