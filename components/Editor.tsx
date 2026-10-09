"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { analyze } from "@/lib/analysis";
import { cellId, isOnBoard, parseCell } from "@/lib/board";
import { OFFICIAL_SCENARIOS } from "@/lib/official";
import { checkTitle, TITLE_MAX } from "@/lib/profanity";
import {
  applyTool,
  cloneLayout,
  emptyLayout,
  footprint,
  hasLayoutParams,
  layoutFromSearchParams,
  layoutToSearchParams,
  occupancy,
  parseLayout,
  dropConflicts,
  remaining,
  toggleStorm,
  usesExpansion,
  type Layout,
} from "@/lib/scenario";
import { BASE_PIECES, EXPANSION_PIECES, MAX_STORMS, PIECE_LIMITS, TOOL_INFO, type PieceKind, type Tool } from "@/lib/tokens";
import BoardSvg, { type BoardGhost } from "./BoardSvg";
import CourseCheck from "./CourseCheck";
import EditDialog from "./EditDialog";
import LegendCard from "./LegendCard";
import PublishDialog, { type PublishConfig } from "./PublishDialog";
import TokenIcon from "./TokenIcon";
import { useBoardOrientation } from "./useBoardOrientation";

const DRAFT_KEY = "sail-workshop:draft:v1";
const PAINTABLE: Tool[] = ["island", "kraken", "whirlpool", "ally", "crowsNest", "erase"];

interface History {
  past: Layout[];
  present: Layout;
  future: Layout[];
}

function hintFor(tool: Tool): string {
  switch (tool) {
    case "start":
      return "Click or tap a space to move the Start token there.";
    case "end":
      return "Click or tap where the End chevron's point goes. It also covers the two spaces behind the point.";
    case "storm":
      return "Click or tap any space to put a storm on its column. Click a cloud to remove it.";
    case "erase":
      return "Click or tap a token to take it off the board.";
    default:
      return `Click or tap a space to place ${/^[aeiou]/i.test(TOOL_INFO[tool].label) ? "an" : "a"} ${TOOL_INFO[tool].label.toLowerCase()}, and again to remove it. Drag with a mouse to place several.`;
  }
}

export interface EditSession {
  id: string;
  key: string;
  title: string;
  author: string;
  notes: string;
  layout: Layout;
}

/**
 * The board editor. Without `edit` it designs a new scenario (drafts are kept
 * in the browser); with `edit` it changes a published one, opened from the
 * author's private edit link.
 */
export default function Editor({ config, edit }: { config: PublishConfig; edit?: EditSession }) {
  const orientation = useBoardOrientation();
  const [history, setHistory] = useState<History>({ past: [], present: emptyLayout(), future: [] });
  const layout = history.present;
  const layoutRef = useRef(layout);
  const [title, setTitle] = useState("");
  const [tool, setTool] = useState<Tool>("island");
  const [expansion, setExpansion] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState("D1");
  const [showRoute, setShowRoute] = useState(true);
  const [toast, setToast] = useState<{ n: number; text: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const cellEls = useRef(new Map<string, SVGGElement>());
  const stroke = useRef<{ tool: Tool; mode: "add" | "remove" } | null>(null);
  const lastPointer = useRef("mouse");

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const say = useCallback((text: string) => setToast((t) => ({ n: (t?.n ?? 0) + 1, text })), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** Record a new layout. `merge` folds it into the current undo step (drag strokes). */
  const commit = useCallback((next: Layout, merge = false) => {
    layoutRef.current = next;
    setHistory((h) =>
      merge ? { ...h, present: next } : { past: [...h.past.slice(-99), h.present], present: next, future: [] },
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  }, []);

  const apply = useCallback(
    (id: string, t: Tool, merge = false) => {
      const res = applyTool(layoutRef.current, t, id);
      if (res.changed) commit(res.layout, merge);
      if (res.message) say(res.message);
      return res.changed;
    },
    [commit, say],
  );

  /* ---------- initial load: published scenario > link > preset > saved draft ---------- */
  useEffect(() => {
    if (edit) {
      const start = dropConflicts(parseLayout(edit.layout).layout);
      layoutRef.current = start;
      setHistory({ past: [], present: start, future: [] });
      setExpansion(usesExpansion(start));
      if (start.start) setActiveCell(start.start);
      setTitle(edit.title);
      setReady(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("preset");
    let start: Layout | null = null;
    let startTitle = "";
    if (preset) {
      const s = OFFICIAL_SCENARIOS.find((x) => x.slug === preset);
      if (s) {
        start = cloneLayout(s.layout);
        say(`Loaded ${s.name}. Change a few tokens to make it your own.`);
      }
    } else if (hasLayoutParams(params)) {
      const parsed = layoutFromSearchParams(params);
      start = parsed.layout;
      startTitle = parsed.title;
      if (parsed.problems.length) say("Some tokens in the link weren't valid board spaces and were left out.");
    } else {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw) as { layout?: unknown; title?: string };
          start = dropConflicts(parseLayout(draft.layout).layout);
          startTitle = typeof draft.title === "string" ? draft.title.slice(0, TITLE_MAX + 10) : "";
        }
      } catch {
        /* storage unavailable or corrupt: start blank */
      }
    }
    if (preset || hasLayoutParams(params)) window.history.replaceState(null, "", window.location.pathname);
    if (start) {
      layoutRef.current = start;
      setHistory({ past: [], present: start, future: [] });
      setExpansion(usesExpansion(start));
      if (start.start) setActiveCell(start.start);
    }
    setTitle(startTitle);
    setReady(true);
  }, [say, edit]);

  /* ---------- autosave (new scenarios only; edits are saved to the server) ---------- */
  useEffect(() => {
    if (!ready || edit) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ layout, title }));
      } catch {
        /* private mode etc. */
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [layout, title, ready, edit]);

  /* ---------- keyboard shortcuts ---------- */
  const tools = useMemo<Tool[]>(
    () => ["start", "end", ...BASE_PIECES, "storm", ...(expansion ? EXPANSION_PIECES : []), "erase"],
    [expansion],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, dialog")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      const t = tools.find((x) => TOOL_INFO[x].shortcut === e.key);
      if (t) setTool(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tools, undo, redo]);

  useEffect(() => {
    const end = () => (stroke.current = null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  /* ---------- board events ---------- */
  const onCellPointerDown = (id: string, e: PointerEvent<SVGGElement>) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    setActiveCell(id);
    const here = occupancy(layoutRef.current).get(id);
    stroke.current = PAINTABLE.includes(tool)
      ? { tool, mode: tool === "erase" || here === tool ? "remove" : "add" }
      : null;
    apply(id, tool);
  };

  const onCellPointerEnter = (id: string, e: PointerEvent<SVGGElement>) => {
    if (e.pointerType === "mouse") setHover(id);
    const s = stroke.current;
    if (!s || e.buttons !== 1) return;
    const here = occupancy(layoutRef.current).get(id);
    if (s.tool === "erase") {
      if (here) apply(id, "erase", true);
    } else if (s.mode === "add") {
      if (!here) apply(id, s.tool, true);
    } else if (here === s.tool) {
      apply(id, s.tool, true);
    }
  };

  const onCellClick = (id: string) => {
    if (lastPointer.current === "mouse") return;
    setActiveCell(id);
    apply(id, tool);
  };

  const onCellKeyDown = (id: string, e: KeyboardEvent<SVGGElement>) => {
    const pos = parseCell(id);
    if (!pos || !orientation) return;
    const { r, c } = pos;
    const h = orientation === "horizontal";
    const keys = {
      forward: h ? "ArrowRight" : "ArrowDown",
      back: h ? "ArrowLeft" : "ArrowUp",
      top: h ? "ArrowUp" : "ArrowLeft",
      bottom: h ? "ArrowDown" : "ArrowRight",
    };
    let candidates: [number, number][] = [];
    if (e.key === keys.forward) candidates = [[r, c + 2], [r - 1, c + 1], [r + 1, c + 1]];
    else if (e.key === keys.back) candidates = [[r, c - 2], [r - 1, c - 1], [r + 1, c - 1]];
    else if (e.key === keys.top) candidates = [[r - 1, c - 1], [r - 1, c + 1]];
    else if (e.key === keys.bottom) candidates = [[r + 1, c + 1], [r + 1, c - 1]];
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      apply(id, tool);
      return;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      apply(id, "erase");
      return;
    } else return;
    e.preventDefault();
    const next = candidates.find(([rr, cc]) => isOnBoard(rr, cc));
    if (!next) return;
    const nid = cellId(next[0], next[1]);
    setActiveCell(nid);
    cellEls.current.get(nid)?.focus();
  };

  const onStormClick = (col: number) => {
    const res = toggleStorm(layoutRef.current, col);
    if (res.changed) {
      commit(res.layout);
      say(`Removed the storm on column ${col}.`);
    }
  };

  /* ---------- derived ---------- */
  const analysis = useMemo(() => analyze(layout), [layout]);
  const occ = useMemo(() => occupancy(layout), [layout]);

  const ghost = useMemo<BoardGhost | null>(() => {
    if (!hover) return null;
    const pos = parseCell(hover);
    if (!pos) return null;
    const here = occ.get(hover);
    if (tool === "storm") {
      return { tool, cells: [], column: pos.c, valid: layout.storms.length < MAX_STORMS || layout.storms.includes(pos.c) };
    }
    if (tool === "erase" || here === tool) {
      if (!here) return null;
      return { tool: "erase", cells: here === "end" && layout.end ? footprint("end", layout.end) : [hover], valid: true };
    }
    const cells = footprint(tool, hover);
    const res = applyTool(layout, tool, hover);
    return { tool, cells: cells.length ? cells : [hover], valid: res.changed || (tool === "start" && layout.start === hover) };
  }, [hover, tool, layout, occ]);

  /* ---------- toolbar actions ---------- */
  const toggleExpansion = (on: boolean) => {
    setExpansion(on);
    if (!on) {
      const cur = layoutRef.current;
      const count = cur.whirlpools.length + cur.allies.length + cur.crowsNests.length;
      if (count) {
        commit({ ...cloneLayout(cur), whirlpools: [], allies: [], crowsNests: [] });
        say(`Took ${count} Seafarers token${count > 1 ? "s" : ""} off the board. Undo puts ${count > 1 ? "them" : "it"} back.`);
      }
      if (EXPANSION_PIECES.includes(tool as PieceKind)) setTool("island");
    }
  };

  const loadPreset = (value: string) => {
    if (!value) return;
    if (value === "blank") {
      commit(emptyLayout());
      say("Started a blank board. Undo brings the previous one back.");
      return;
    }
    const s = OFFICIAL_SCENARIOS.find((x) => x.slug === value);
    if (s) {
      commit(cloneLayout(s.layout));
      say(`Loaded ${s.name}. Change a few tokens to make it your own.`);
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}/?${layoutToSearchParams(layout, title).toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied. It opens this layout in the editor.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const titleCheck = checkTitle(title);
  const titleMessage = title.trim() === "" ? "Needed to publish." : titleCheck.ok ? `${title.trim().length}/${TITLE_MAX}` : titleCheck.message;
  const bestRoute = showRoute ? (analysis.safest?.cells ?? null) : null;

  const countLabel = (t: Tool): string => {
    if (t === "start") return layout.start ? `On ${layout.start}` : "Not placed";
    if (t === "end") return layout.end ? `Point on ${layout.end}` : "Not placed";
    if (t === "storm") return `${MAX_STORMS - layout.storms.length} of ${MAX_STORMS} left`;
    if (t === "erase") return "Take off";
    return `${remaining(layout, t)} of ${PIECE_LIMITS[t]} left`;
  };

  return (
    <div className="workbench">
      <div className="workbench-head">
        <div className="intro">
          {edit ? (
            <>
              <h1>Edit your scenario</h1>
              <p>
                You opened this from your private edit link. Changes go live on the{" "}
                <Link href={`/s/${edit.id}`}>scenario page</Link> when you save them.
              </p>
            </>
          ) : (
            <>
              <h1>Design a scenario</h1>
              <p>
                Place what the box holds: up to 12 islands, 9 krakens and 2 storms, plus the Start and the three-space End. The course
                check tells you whether a crew can make it.
              </p>
            </>
          )}
        </div>
        <div className="actions" role="group" aria-label="Board actions">
          <button type="button" className="btn btn--icon" onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)">
            <span aria-hidden="true">↶</span>
            <span className="sr-only">Undo</span>
          </button>
          <button type="button" className="btn btn--icon" onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Shift+Z)">
            <span aria-hidden="true">↷</span>
            <span className="sr-only">Redo</span>
          </button>
          <label className="select">
            <span className="sr-only">Start from</span>
            <select
              value=""
              onChange={(e) => {
                loadPreset(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Start from…</option>
              <option value="blank">Blank board</option>
              {OFFICIAL_SCENARIOS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name} (from the box)
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={shareLink}>
            Copy link
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setPublishOpen(true)}>
            {edit ? "Save changes" : "Publish"}
          </button>
        </div>
      </div>

      <div className="palette" role="toolbar" aria-label="Tokens">
        <div className="palette-tools">
          {tools.map((t) => {
            const empty = t !== "erase" && t !== "start" && t !== "end" && countLabel(t).startsWith("0 ");
            return (
              <button
                key={t}
                type="button"
                className={`tool${tool === t ? " tool--active" : ""}${TOOL_INFO[t].source === "seafarers" ? " tool--expansion" : ""}`}
                aria-pressed={tool === t}
                onClick={() => setTool(t)}
                title={`${TOOL_INFO[t].rule} (key ${TOOL_INFO[t].shortcut})`}
              >
                <TokenIcon kind={t} size={30} />
                <span className="tool-text">
                  <span className="tool-name">{TOOL_INFO[t].label}</span>
                  <span className={`tool-count${empty ? " tool-count--empty" : ""}`}>{countLabel(t)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={expansion} onChange={(e) => toggleExpansion(e.target.checked)} />
          <span>Seafarers tokens</span>
        </label>
      </div>

      <div className={`board-frame${orientation === "vertical" ? " board-frame--vertical" : ""}`}>
        {ready && orientation ? (
          <BoardSvg
            layout={layout}
            orientation={orientation}
            label="Scenario board. Use the arrow keys to move between spaces and Enter to place the selected token."
            interactive
            route={bestRoute}
            traps={showRoute ? analysis.traps : []}
            ghost={ghost}
            activeCell={activeCell}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onCellPointerLeave={() => setHover(null)}
            onCellClick={onCellClick}
            onCellKeyDown={onCellKeyDown}
            onCellFocus={(id) => setActiveCell(id)}
            onStormClick={onStormClick}
            cellRef={(id, el) => {
              if (el) cellEls.current.set(id, el);
              else cellEls.current.delete(id);
            }}
          />
        ) : (
          <div className="board-placeholder" aria-hidden="true" />
        )}
        <div className="board-caption">
          <p>{hintFor(tool)}</p>
          <label className="toggle toggle--small">
            <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />
            <span>Show best route and dead ends</span>
          </label>
        </div>
      </div>

      <div className="sheet">
        <LegendCard
          layout={layout}
          titleSlot={
            <label className="title-field">
              <span className="sr-only">Scenario name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your scenario"
                maxLength={TITLE_MAX + 10}
                aria-invalid={title.trim() !== "" && !titleCheck.ok}
                aria-describedby="title-status"
                autoComplete="off"
              />
              <small id="title-status" className={title.trim() !== "" && !titleCheck.ok ? "field-error" : "field-hint"}>
                {titleMessage}
              </small>
            </label>
          }
        />
        <CourseCheck analysis={analysis} />
      </div>

      {edit ? (
        <EditDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          layout={layout}
          title={title}
          onTitleChange={setTitle}
          analysis={analysis}
          edit={edit}
        />
      ) : (
        <PublishDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          layout={layout}
          title={title}
          onTitleChange={setTitle}
          analysis={analysis}
          config={config}
        />
      )}

      <div className="toast-region" aria-live="polite" role="status">
        {toast && (
          <p className="toast" key={toast.n}>
            {toast.text}
          </p>
        )}
      </div>
    </div>
  );
}
