/// <reference lib="webworker" />
import { estimateDifficulty } from "./difficulty";
import type { Layout } from "./scenario";

/** Runs the difficulty simulation off the main thread so the editor stays responsive. */
self.onmessage = (event: MessageEvent<{ id: number; layout: Layout }>) => {
  const { id, layout } = event.data;
  const result = estimateDifficulty(layout, (partial) => self.postMessage({ id, done: false, result: partial }));
  self.postMessage({ id, done: true, result });
};
