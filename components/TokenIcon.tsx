import type { Tool } from "@/lib/tokens";

/** Small token glyphs for the palette and the legend, drawn like the printed tokens. */
export default function TokenIcon({ kind, size = 28 }: { kind: Tool; size?: number }) {
  const common = { width: size, height: size * 0.72, viewBox: "0 0 40 29", "aria-hidden": true as const };
  const diamond = "20,1.5 38.5,14.5 20,27.5 1.5,14.5";
  switch (kind) {
    case "start":
      return (
        <svg {...common} className="ticon ticon--start">
          <polygon points={diamond} />
        </svg>
      );
    case "end":
      return (
        <svg {...common} viewBox="0 0 40 40" height={size} className="ticon ticon--end">
          <polygon points="13,1.5 26,10.5 38.5,20 26,29.5 13,38.5 1.5,29.5 13,20 1.5,10.5" />
        </svg>
      );
    case "island":
      return (
        <svg {...common} className="ticon ticon--island">
          <polygon points={diamond} />
          <ellipse cx="14" cy="12" rx="5" ry="3" className="blot" />
          <ellipse cx="25" cy="18" rx="3.5" ry="2.2" className="blot" />
        </svg>
      );
    case "kraken":
      return (
        <svg {...common} className="ticon ticon--kraken">
          <polygon points={diamond} />
          <path d="M14 20c0-6 9-9 12-4s-3 7-5 4 2-4 3-1" className="curl" />
        </svg>
      );
    case "storm":
      return (
        <svg {...common} viewBox="-24 -26 46 36" className="ticon ticon--storm">
          <path d="M-21 8 a9 9 0 0 1 2-17 a11 11 0 0 1 19-5 a10 10 0 0 1 17 6 a8.5 8.5 0 0 1 1 16 z" />
        </svg>
      );
    case "whirlpool":
      return (
        <svg {...common} className="ticon ticon--whirlpool">
          <polygon points={diamond} />
          <path d="M20 14.5m-1 0a1 1 0 1 1 2 0a3 3 0 1 1-6 0a5.5 5.5 0 1 1 11 0" className="curl" />
        </svg>
      );
    case "ally":
      return (
        <svg {...common} className="ticon ticon--ally">
          <polygon points={diamond} />
          <path d="M14 18h12l-2 3h-8z M20 8v10 M20 9l5 7h-5" className="curl" />
        </svg>
      );
    case "crowsNest":
      return (
        <svg {...common} className="ticon ticon--crowsNest">
          <polygon points={diamond} />
          <path d="M20 6v12 M15 17h10l-1.5 4h-7z" className="curl" />
        </svg>
      );
    case "erase":
      return (
        <svg {...common} className="ticon ticon--erase">
          <polygon points={diamond} />
          <path d="M15 10l10 9 M25 10l-10 9" className="curl" />
        </svg>
      );
  }
}
