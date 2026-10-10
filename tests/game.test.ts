import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CARD_COUNT,
  KRAKEN_CARD,
  followerWins,
  krakenDeckCards,
  legalFollows,
  pairKind,
  playerDeckCards,
  symOf,
  VALUES,
} from "../lib/game/cards";
import { boardFromLayout, CELL_ID, COL } from "../lib/game/geometry";
import { earliest } from "../lib/game/ideal";
import { applyDamage, applyTrick, createGame, krakenState, simulate, type Game } from "../lib/game/simulate";
import { OFFICIAL_SCENARIOS } from "../lib/official";
import { emptyLayout, type Layout } from "../lib/scenario";

/** Card id from colour (0–2) and number (1–9). */
const card = (colour: number, value: number) => colour * VALUES + value - 1;

const open = (over: Partial<Layout> = {}): Layout => ({ ...emptyLayout(), end: "D21", ...over });

function game(layout: Layout, setup: Partial<Game> = {}): Game {
  const g = createGame(boardFromLayout(layout)!, { seed: 3 });
  g.round = 1;
  g.hands = [[], []];
  Object.assign(g, setup);
  for (const c of g.krakenDeck) if (c >= 0) g.seen[c] = 1;
  return g;
}

const at = (g: Game) => CELL_ID[g.ship];

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

test("cards: three colours of 1–9 with the symbol fixed by the number", () => {
  assert.equal(CARD_COUNT, 27);
  for (let colour = 0; colour < 3; colour++) {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => symOf(card(colour, v))),
      ["T", "T", "T", "C", "C", "H", "H", "H", "F"],
    );
  }
  assert.equal(playerDeckCards().length, 21);
  assert.equal(krakenDeckCards().length, 6);
  assert.equal(playerDeckCards().filter((c) => symOf(c) === "F").length, 3, "only three fish tails");
});

test("cards: follow suit, highest of the led colour wins", () => {
  assert.equal(followerWins(card(0, 6), card(0, 8)), true);
  assert.equal(followerWins(card(0, 8), card(0, 6)), false);
  assert.equal(followerWins(card(0, 3), card(1, 9)), false, "off-colour never wins");
  const hand = [card(0, 4), card(1, 7), card(1, 9)];
  assert.deepEqual(legalFollows(hand, card(0, 8)), [card(0, 4)]);
  assert.deepEqual(legalFollows(hand, card(2, 8)), hand, "out of the colour: anything goes");
});

test("cards: the six pairs on the player aid, everything else does nothing", () => {
  const [t, c, h, f] = [card(0, 3), card(0, 4), card(0, 7), card(0, 9)];
  assert.equal(pairKind(h, h), "helm");
  assert.equal(pairKind(h, t), "helm1");
  assert.equal(pairKind(t, t), "helm2");
  assert.equal(pairKind(t, c), "heal");
  assert.equal(pairKind(f, f), "fish");
  assert.equal(pairKind(c, c), "flip");
  for (const [a, b] of [[h, c], [h, f], [c, f], [t, f]]) assert.equal(pairKind(a, b), "none");
});

/* ------------------------------------------------------------------ */
/* Tricks                                                              */
/* ------------------------------------------------------------------ */

test("trick: helm pair moves towards the winner", () => {
  const g = game(open());
  const w = applyTrick(g, 0, card(0, 7), card(0, 8)); // seat 1 (row G side) wins with the 8
  assert.equal(w, 1);
  assert.equal(at(g), "E2");
  applyTrick(g, 1, card(1, 8), card(1, 6)); // leader (seat 1) wins again
  assert.equal(at(g), "F3");
  applyTrick(g, 1, card(2, 6), card(0, 8)); // off-colour 8 can't win: seat 1 again
  assert.equal(at(g), "G4");
  applyTrick(g, 0, card(1, 6), card(1, 7)); // seat 1 wins, but row G is the edge: blocked
  assert.equal(at(g), "G4");
});

test("trick: tentacles hurt even when the move is blocked; the Kraken card goes to the discard", () => {
  const g = game(open({ islands: ["E2"] }));
  const before = krakenState(g);
  applyTrick(g, 0, card(0, 3), card(0, 7)); // T + H, seat 1 wins towards E2 = island
  assert.equal(at(g), "D1");
  assert.equal(krakenState(g).above, before.above - 1);
  assert.equal(g.discard.filter((c) => c < CARD_COUNT && symOf(c) === "T" && c % 9 < 2).length, 1);
  applyTrick(g, 0, card(1, 2), card(1, 3)); // T + T: two more
  assert.equal(krakenState(g).above, before.above - 3);
});

test("trick: tentacle + cannon heals, the tentacle card goes under the Kraken deck", () => {
  const g = game(open());
  const t = card(2, 3);
  applyTrick(g, 0, t, card(2, 5));
  assert.equal(g.krakenDeck[0], t);
  assert.ok(!g.discard.includes(t));
  assert.equal(krakenState(g).below, 1);
});

test("trick: fish pair goes straight ahead two columns", () => {
  const g = game(open());
  applyTrick(g, 0, card(0, 9), card(1, 9));
  assert.equal(at(g), "D3");
});

test("trick: cannon pair flips until a non-cannon card, then applies it", () => {
  const g = game(open(), { deck: [card(2, 9), card(1, 4), card(0, 5)] }); // top is the end: 5, then 4, then the 9
  applyTrick(g, 0, card(0, 4), card(1, 5));
  assert.equal(at(g), "D3", "two cannons flipped, then a fish tail: straight ahead");
  assert.equal(g.deck.length, 0);

  const h = game(open(), { deck: [card(2, 6)] });
  applyTrick(h, 0, card(0, 5), card(0, 4)); // leader wins (5 > 4): helm towards row A
  assert.equal(at(h), "C2");

  const k = game(open(), { deck: [card(2, 3)] });
  applyTrick(k, 0, card(0, 5), card(0, 4));
  assert.equal(k.krakenDeck[0], card(2, 3), "flipped tentacle goes under the Kraken deck");

  const e = game(open(), { deck: [] });
  applyTrick(e, 0, card(0, 5), card(0, 4));
  assert.equal(at(e), "D1", "empty deck: no effect");
});

test("trick: entering a Kraken space hurts; reaching the End wins before any damage", () => {
  const g = game(open({ kraken: ["C2"] }));
  const before = krakenState(g).above;
  applyTrick(g, 0, card(0, 8), card(0, 7)); // leader (row A side) wins
  assert.equal(at(g), "C2");
  assert.equal(krakenState(g).above, before - 1);

  const w = game({ ...emptyLayout(), end: "D3" }); // End covers C2, E2, D3
  const health = krakenState(w).above;
  applyTrick(w, 0, card(0, 3), card(0, 2)); // T + T, leader wins: towards C2
  assert.equal(w.status, "won");
  assert.equal(krakenState(w).above, health, "the win comes before the tentacle damage");
});

test("rounds: a round ends with a 4th win; pirate 4 plays one more trick", () => {
  const g = game(open());
  for (let i = 0; i < 3; i++) applyTrick(g, 0, card(0, 4), card(1, 5)); // nothing happens, leader wins
  assert.equal(g.roundOver, false);
  applyTrick(g, 0, card(0, 4), card(1, 5));
  assert.equal(g.roundOver, true);

  const p = createGame(boardFromLayout(open())!, { pirates: [4, null] });
  p.round = 1;
  for (let i = 0; i < 4; i++) applyTrick(p, 0, card(0, 4), card(1, 5));
  assert.equal(p.roundOver, false, "pirate 4: extra trick");
  applyTrick(p, 0, card(0, 4), card(1, 5));
  assert.equal(p.roundOver, true);
});

test("kraken: a hit with the Kraken card on top advances the meeple; only the Kraken card left = lost", () => {
  const g = game(open(), { krakenDeck: [card(0, 1), KRAKEN_CARD] }); // Kraken card on top, one card below
  applyDamage(g);
  assert.equal(g.meeple, 1);
  assert.deepEqual(g.krakenDeck, [KRAKEN_CARD, card(0, 1)]);
  applyDamage(g);
  assert.equal(g.status, "lost");
  assert.equal(g.reason, "kraken");
});

test("pirates: 3 sends same-number helms straight, 5 lets a grey helm go towards the partner", () => {
  const g = createGame(boardFromLayout(open())!, { pirates: [3, null] });
  g.round = 1;
  applyTrick(g, 0, card(1, 7), card(2, 7)); // seat 0 leads and wins, two 7s
  assert.equal(CELL_ID[g.ship], "D3", "pirate 3 chooses straight (better progress on an open board)");

  const h = createGame(boardFromLayout(open({ islands: ["C2"] }))!, { pirates: [5, null] });
  h.round = 1;
  applyTrick(h, 0, card(0, 8), card(0, 6)); // seat 0 wins with a grey 8: may go towards seat 1 instead of the island
  assert.equal(CELL_ID[h.ship], "E2");
});

/* ------------------------------------------------------------------ */
/* Best case                                                           */
/* ------------------------------------------------------------------ */

test("best case: at most 7 moves per round, one of them straight; pirate 4 allows 8", () => {
  const b = boardFromLayout(open())!; // open sea, End point D21 (C20, E20, D21)
  const end = (c: number) => b.goal[c] === 1;
  const base = earliest(b, end)!;
  // 7 moves a round = 6 helm (+6 columns) + 1 fish (+2): column 9 after round 1, 17 after round 2.
  assert.equal(base.round, 3);
  assert.equal(base.trick, 2);
  const perRound = [1, 2, 3].map((r) => base.moveRounds.filter((x) => x === r).length);
  assert.ok(perRound.every((n) => n <= 7), `moves per round ${perRound}`);
  const p4 = earliest(b, end, { extraTrick: true })!;
  assert.ok(p4.round === 3 && p4.trick === 1, `pirate 4: R${p4.round}T${p4.trick}`);
});

test("best case: helm moves follow the trick winner, so a round can't go one way more than 4 times", () => {
  // From G4, C8 is four moves towards row A: four wins in a row, done in trick 4 of round 1.
  const b = boardFromLayout({ ...emptyLayout(), start: "G4", end: "B9" })!; // End: A8, C8, B9
  const plan = earliest(b, (c) => b.goal[c] === 1)!;
  assert.equal(plan.round, 1);
  assert.equal(plan.trick, 4);
  // A10 is six moves towards row A with no other way there: the 4th win ends round 1, so it takes two rounds.
  const rowA = earliest(b, (c) => CELL_ID[c] === "A10")!;
  assert.equal(rowA.round, 2);
});

test("best case: storms must be passed by their deadlines", () => {
  const b = boardFromLayout(open({ end: "D25", storms: [17] }))!; // single storm: end of round 2
  const past = earliest(b, (c) => COL[c] > 17);
  assert.equal(past, null, "column 17 can't be passed by the end of round 2 (max column 17)");
  const ok = boardFromLayout(open({ end: "D25", storms: [16] }))!;
  assert.ok(earliest(ok, (c) => COL[c] > 16));
});

test("best case: printed scenarios all fit", () => {
  for (const s of OFFICIAL_SCENARIOS) {
    const b = boardFromLayout(s.layout)!;
    assert.ok(earliest(b, (c) => b.goal[c] === 1), s.name);
  }
});

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

test("simulation: repeatable, and the printed scenarios get harder in order", () => {
  const rates = OFFICIAL_SCENARIOS.map((s) => simulate(boardFromLayout(s.layout)!, { games: 120, seed: 5 }).winRate);
  const again = simulate(boardFromLayout(OFFICIAL_SCENARIOS[2].layout)!, { games: 120, seed: 5 }).winRate;
  assert.equal(again, rates[2]);
  assert.ok(rates[0] > rates[3] && rates[3] > rates[5], `win rates ${rates.map((r) => r.toFixed(2))}`);
});

test("simulation: never more tricks per round than the rules allow", () => {
  const r = simulate(boardFromLayout(OFFICIAL_SCENARIOS[5].layout)!, { games: 60, seed: 9 });
  assert.ok(r.tricksPerRound <= 7 && r.tricksPerRound >= 4, `${r.tricksPerRound}`);
  assert.ok(r.movesPerRound <= r.tricksPerRound);
  const p4 = simulate(boardFromLayout(OFFICIAL_SCENARIOS[5].layout)!, { games: 60, seed: 9, pirates: [4, null] });
  assert.ok(p4.tricksPerRound <= 8 && p4.tricksPerRound > r.tricksPerRound);
});
