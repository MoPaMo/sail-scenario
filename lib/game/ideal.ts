import { CELLS, COL, DIR_AHEAD, DIR_BOTTOM, DIR_TOP, step, type Board } from "./geometry";

/**
 * Best case: the earliest moment the ship can reach a target if the cards fall
 * perfectly, while respecting how rounds and tricks work:
 *
 *  - every trick has a winner; a round ends when one player wins their 4th
 *    trick, so a round lasts 4–7 tricks (one more with pirate 4, if *that*
 *    player is the one who reaches 4);
 *  - each trick makes at most one move: a helm move goes one column forward and
 *    towards the side of the player who won that trick; a fish-tail move goes
 *    two columns straight ahead and needs two 9s, of which there are three, so
 *    at most one per round;
 *  - islands and the board edge block a move (the trick is spent anyway);
 *  - storms must be passed by the end of round 2 (and 4), and the game is lost
 *    when round 5 ends.
 *
 * Every trick is assumed to produce the move we want, which is far better than
 * real play; the simulation estimates how things go with real cards.
 */

export interface IdealOptions {
  /** Pirate 4 is in play: the round gets one more trick when its player wins a 4th trick. */
  extraTrick?: boolean;
  /** Fish-tail (straight) moves allowed per round. */
  straightPerRound?: number;
  /** Helm moves may go towards either side whoever wins (absolute limit only). */
  freeDirection?: boolean;
  /** Tricks per round cap override (absolute limit only). */
  tricksPerRound?: number;
}

export interface IdealPlan {
  /** Round (1–5) and trick within that round in which the target is reached. */
  round: number;
  trick: number;
  /** Total tricks played until then, and how many of them moved the ship. */
  tricks: number;
  moves: number;
  krakenHits: number;
  /** Cells visited, starting with the start cell. */
  cells: number[];
  /** For each move in `cells` (after the first): the round it happens in. */
  moveRounds: number[];
}

interface Node {
  hits: number;
  moves: number;
  prev: Node | null;
  cell: number;
  round: number;
  moved: boolean;
}

const ROUNDS = 5;

export function earliest(b: Board, isTarget: (cell: number) => boolean, opts: IdealOptions = {}): IdealPlan | null {
  if (isTarget(b.start)) {
    return { round: 1, trick: 0, tricks: 0, moves: 0, krakenHits: 0, cells: [b.start], moveRounds: [] };
  }
  const seats: (number | null)[] = opts.extraTrick ? [0, 1] : [null];
  let best: IdealPlan | null = null;
  for (const p4Seat of seats) {
    const plan = search(b, isTarget, opts, p4Seat);
    if (plan && (!best || better(plan, best))) best = plan;
  }
  return best;
}

const better = (a: IdealPlan, b: IdealPlan) =>
  a.round !== b.round ? a.round < b.round : a.trick !== b.trick ? a.trick < b.trick : a.krakenHits < b.krakenHits;

function search(b: Board, isTarget: (cell: number) => boolean, opts: IdealOptions, p4Seat: number | null): IdealPlan | null {
  const S = opts.straightPerRound ?? 1;
  const cap = opts.tricksPerRound ?? 7;
  // State within a round: cell, wins of seat 0 and 1 (0–3), straight moves used, phase
  // (0 normal, 1 = pirate 4's extra trick is next). Encoded as one integer.
  const key = (cell: number, w0: number, w1: number, s: number, phase: number) =>
    ((((cell * 4 + w0) * 4 + w1) * (S + 1) + s) * 2 + phase) | 0;

  let layer = new Map<number, Node>();
  layer.set(key(b.start, 0, 0, 0, 0), { hits: 0, moves: 0, prev: null, cell: b.start, round: 1, moved: false });

  for (let round = 1; round <= ROUNDS; round++) {
    const nextRound = new Map<number, Node>();
    const found: { node: Node | null; trick: number } = { node: null, trick: 0 };

    for (let trick = 1; layer.size > 0 && trick <= cap + 1; trick++) {
      const next = new Map<number, Node>();
      for (const [k, node] of layer) {
        const phase = k & 1;
        const s = ((k >> 1) % (S + 1)) | 0;
        const rest = Math.floor(Math.floor(k / 2) / (S + 1));
        const w1 = rest % 4;
        const w0 = Math.floor(rest / 4) % 4;
        const cell = node.cell;

        for (let winner = 0; winner < 2; winner++) {
          // Which moves this trick can make.
          const targets: number[] = [-1]; // -1 = no move
          const helmDirs = opts.freeDirection ? [DIR_TOP, DIR_BOTTOM] : [winner === 0 ? DIR_TOP : DIR_BOTTOM];
          for (const dir of helmDirs) targets.push(step(b, cell, dir));
          const straightTarget = s < S ? step(b, cell, DIR_AHEAD) : -1;

          for (let a = 0; a < targets.length + 1; a++) {
            const isStraight = a === targets.length;
            const t = isStraight ? straightTarget : targets[a];
            if (a > 0 && t < 0) continue; // blocked move = same as no move
            const to = t >= 0 ? t : cell;
            const moved = t >= 0;
            const child: Node = {
              hits: node.hits + (moved && b.kraken[to] ? 1 : 0),
              moves: node.moves + (moved ? 1 : 0),
              prev: node,
              cell: to,
              round,
              moved,
            };
            if (moved && isTarget(to)) {
              if (!found.node || child.hits < found.node.hits) {
                found.node = child;
                found.trick = trick;
              }
              continue;
            }
            const ns = s + (isStraight && moved ? 1 : 0);
            // Round bookkeeping.
            let roundOver = false;
            let n0 = w0;
            let n1 = w1;
            let nPhase = phase;
            if (phase === 1) roundOver = true;
            else {
              if (winner === 0) n0++;
              else n1++;
              const reached = winner === 0 ? n0 : n1;
              if (reached >= 4 || n0 + n1 >= cap) {
                if (p4Seat === winner && reached >= 4) nPhase = 1;
                else roundOver = true;
              }
            }
            if (roundOver) {
              if (!meetsDeadlines(b, to, round)) continue;
              const nk = key(to, 0, 0, 0, 0);
              const old = nextRound.get(nk);
              if (!old || child.hits < old.hits) nextRound.set(nk, child);
            } else {
              const nk = key(to, Math.min(n0, 3), Math.min(n1, 3), ns, nPhase);
              const old = next.get(nk);
              if (!old || child.hits < old.hits) next.set(nk, child);
            }
          }
        }
      }
      if (found.node) return toPlan(found.node, round, found.trick, b.start);
      layer = next;
    }
    layer = nextRound;
  }
  return null;
}

function meetsDeadlines(b: Board, cell: number, round: number): boolean {
  if (round >= ROUNDS) return false;
  for (let i = 0; i < b.storms.length; i++) {
    if (b.deadlines[i] === round && COL[cell] <= b.storms[i]) return false;
  }
  return true;
}

function toPlan(end: Node, round: number, trick: number, start: number): IdealPlan {
  const chain: Node[] = [];
  for (let n: Node | null = end; n; n = n.prev) chain.push(n);
  chain.reverse();
  const cells = [start];
  const moveRounds: number[] = [];
  for (const n of chain.slice(1)) {
    if (n.moved) {
      cells.push(n.cell);
      moveRounds.push(n.round);
    }
  }
  return { round, trick, tricks: chain.length - 1, moves: end.moves, krakenHits: end.hits, cells, moveRounds };
}

/** Tricks played in rounds before `round`, for display ("trick 3 of round 2"). */
export const MAX_TRICKS = 7;
export { CELLS };
