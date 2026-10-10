"use client";

import { useEffect, useState } from "react";
import { DIFFICULTY_GAMES, layoutSignature } from "@/lib/difficulty";
import type { SimResult } from "@/lib/game/simulate";
import type { Layout } from "@/lib/scenario";

export interface DifficultyState {
  result: SimResult | null;
  /** Games simulated so far, out of DIFFICULTY_GAMES. */
  played: number;
  running: boolean;
}

const cache = new Map<string, SimResult>();
let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  worker ??= new Worker(new URL("../lib/difficulty.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/**
 * Simulated difficulty of a layout, computed in a web worker after edits
 * settle. Results are cached per layout, so undo/redo shows them at once.
 */
export function useDifficulty(layout: Layout, enabled: boolean, delayMs = 500): DifficultyState {
  const key = layoutSignature(layout);
  const [state, setState] = useState<DifficultyState & { key: string }>({ key: "", result: null, played: 0, running: false });

  useEffect(() => {
    if (!enabled) {
      setState({ key, result: null, played: 0, running: false });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ key, result: cached, played: cached.games, running: false });
      return;
    }
    setState((s) => ({ key, result: s.key === key ? s.result : null, played: 0, running: true }));
    const id = nextId++;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const w = getWorker();
      if (!w) return setState({ key, result: null, played: 0, running: false });
      const onMessage = (e: MessageEvent<{ id: number; done: boolean; result: SimResult | null }>) => {
        if (e.data.id !== id || cancelled) return;
        const r = e.data.result;
        if (e.data.done) {
          w.removeEventListener("message", onMessage);
          if (r) cache.set(key, r);
          setState({ key, result: r, played: r?.games ?? 0, running: false });
        } else if (r) {
          setState({ key, result: r, played: r.games, running: true });
        }
      };
      w.addEventListener("message", onMessage);
      w.postMessage({ id, layout });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // A newer layout supersedes a run in progress: restart the worker rather than wait for it.
      if (worker && !cache.has(key)) {
        worker.terminate();
        worker = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, delayMs]);

  return state.key === key ? state : { result: null, played: 0, running: enabled };
}

export { DIFFICULTY_GAMES };
