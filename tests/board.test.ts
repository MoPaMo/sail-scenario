import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_CELL_IDS, endTokenCellIds, isOnBoard, parseCell } from "../lib/board";
import { analyze, officialCopy } from "../lib/analysis";
import { OFFICIAL_SCENARIOS } from "../lib/official";
import {
  applyTool,
  emptyLayout,
  layoutFromSearchParams,
  layoutToSearchParams,
  legendRows,
  parseLayout,
  stormText,
} from "../lib/scenario";
import { PIECE_LIMITS } from "../lib/tokens";

test("board has 79 spaces, tapering to D1 and D25", () => {
  assert.equal(ALL_CELL_IDS.length, 79);
  for (const id of ["D1", "C2", "E2", "B3", "F3", "A4", "G4", "A22", "G22", "B23", "F23", "C24", "E24", "D25"]) {
    assert.ok(parseCell(id), `${id} should exist`);
  }
  for (const id of ["A2", "G2", "B1", "F1", "A24", "G24", "B25", "F25", "D2", "A5", "H4", "D26", "D0"]) {
    assert.equal(parseCell(id), null, `${id} should not exist`);
  }
  assert.equal(isOnBoard(3, 1), true);
});

test("End token covers the chevron behind its point", () => {
  assert.deepEqual(endTokenCellIds("D11"), ["C10", "E10", "D11"]);
  assert.deepEqual(endTokenCellIds("D25"), ["C24", "E24", "D25"]);
  assert.deepEqual(endTokenCellIds("A10"), [], "point on row A leaves no room above");
  assert.deepEqual(endTokenCellIds("D1"), [], "point on D1 would stick off the board");
});

test("all six printed scenarios are valid, reachable and within the box's tokens", () => {
  for (const s of OFFICIAL_SCENARIOS) {
    const { problems } = parseLayout(s.layout);
    assert.deepEqual(problems, [], s.name);
    assert.ok(s.layout.islands.length <= PIECE_LIMITS.island);
    assert.ok(s.layout.kraken.length <= PIECE_LIMITS.kraken);
    const a = analyze(s.layout);
    assert.ok(a.reachable, `${s.name} reachable`);
    assert.deepEqual(a.traps, [], `${s.name} has no dead ends`);
    assert.equal(officialCopy(s.layout), s.name);
    assert.equal(a.canPublish, false, "an unchanged printed scenario can't be published");
  }
});

test("legend matches the scenario book's wording", () => {
  const s1 = OFFICIAL_SCENARIOS[1].layout;
  const rows = Object.fromEntries(legendRows(s1).map((r) => [r.heading, r.value]));
  assert.equal(rows.Start, "D1");
  assert.equal(rows.Island, "D3, G6, C10, G10, G12, A16, G16");
  assert.equal(rows.Kraken, "G4, A6, C8, C12, A14, F15");
  assert.equal(rows.End, "C16, E16, D17");
  assert.equal(stormText(s1), "Column 5 and 12");
  assert.equal(stormText(OFFICIAL_SCENARIOS[0].layout), "Column 5");
});

test("token limits come from the box", () => {
  let l = emptyLayout();
  const free = ALL_CELL_IDS.filter((id) => id !== "D1");
  for (let i = 0; i < 12; i++) l = applyTool(l, "island", free[i]).layout;
  assert.equal(l.islands.length, 12);
  const res = applyTool(l, "island", free[12]);
  assert.equal(res.changed, false);
  assert.match(res.message!, /All 12 islands/);

  let k = emptyLayout();
  for (let i = 0; i < 10; i++) k = applyTool(k, "kraken", free[i]).layout;
  assert.equal(k.kraken.length, 9);

  let s = emptyLayout();
  for (const col of [5, 9, 14]) s = applyTool(s, "storm", `D${col}`).layout;
  assert.deepEqual(s.storms, [5, 9], "only 4 storm clouds = 2 storms");
});

test("placing tools: toggle, replace, and protection of Start/End", () => {
  let l = applyTool(emptyLayout(), "island", "D3").layout;
  assert.deepEqual(l.islands, ["D3"]);
  l = applyTool(l, "kraken", "D3").layout;
  assert.deepEqual(l.islands, []);
  assert.deepEqual(l.kraken, ["D3"]);
  l = applyTool(l, "kraken", "D3").layout;
  assert.deepEqual(l.kraken, []);

  const blockedStart = applyTool(emptyLayout(), "island", "D1");
  assert.equal(blockedStart.changed, false);

  l = applyTool(emptyLayout(), "end", "D11").layout;
  assert.equal(l.end, "D11");
  assert.equal(applyTool(l, "kraken", "C10").changed, false);
  l = applyTool(l, "erase", "E10").layout;
  assert.equal(l.end, null, "erasing any End space removes the whole token");
});

test("parseLayout rejects overlaps, off-board spaces and extra tokens", () => {
  const { problems } = parseLayout({
    start: "D1",
    end: "D11",
    islands: ["C10", "A2", ...ALL_CELL_IDS.slice(20, 33)],
    kraken: ["D1"],
    storms: [5, 9, 14, 40],
  });
  assert.ok(problems.some((p) => p.includes("C10 holds both")));
  assert.ok(problems.some((p) => p.includes("A2")));
  assert.ok(problems.some((p) => p.includes("only 12 islands")));
  assert.ok(problems.some((p) => p.includes("D1 holds both")));
  assert.ok(problems.some((p) => p.includes("only 2 storms")));
  assert.ok(problems.some((p) => p.includes("40")));
});

test("share links round-trip", () => {
  const layout = { ...OFFICIAL_SCENARIOS[3].layout, kraken: ["A6", "G4"] };
  const params = layoutToSearchParams(layout, "Kraken Alley");
  const back = layoutFromSearchParams(new URLSearchParams(params.toString()));
  assert.equal(back.title, "Kraken Alley");
  assert.deepEqual(back.layout.islands, layout.islands);
  assert.deepEqual(back.layout.kraken, ["G4", "A6"]);
  assert.deepEqual(back.layout.storms, layout.storms);
  assert.equal(back.layout.end, layout.end);
});

test("analysis catches unreachable ends, misplaced storms and dead ends", () => {
  // One column of islands isn't a wall: fish-tail moves jump two columns. Columns 6 and 7 together are.
  const leaky = { ...emptyLayout(), end: "D17", islands: ["A6", "C6", "E6", "G6"], storms: [] as number[] };
  assert.equal(analyze(leaky).reachable, true);
  const walled = { ...leaky, islands: ["A6", "C6", "E6", "G6", "B7", "D7", "F7"] };
  const w = analyze(walled);
  assert.equal(w.reachable, false);
  assert.ok(w.errors.some((e) => e.includes("can't be reached")));

  const lateStorm = { ...emptyLayout(), end: "D11", storms: [10] };
  assert.ok(analyze(lateStorm).errors.some((e) => e.includes("on or past the End")));

  // B5 is a pocket: A6 and C6 are islands and B7 is an island, so a ship on B5 is stuck.
  const pocket = { ...emptyLayout(), end: "D17", islands: ["A6", "C6", "B7"], storms: [] as number[] };
  const p = analyze(pocket);
  assert.ok(p.reachable);
  assert.ok(p.traps.includes("B5"), `expected B5 among ${p.traps.join(",")}`);
});

test("analysis: storm warnings follow the round model", () => {
  // Ideal cards on open sea: 7 moves a round (6 helm + 1 fish) = 8 columns, so column 17 after round 2.
  const storm = (col: number) => analyze({ ...emptyLayout(), end: "D25", storms: [col] });
  const ok16 = storm(16);
  assert.ok(ok16.checks.some((c) => c.severity === "ok" && c.text.includes("column 16")));
  // Column 17 needs pirate 4's 8th trick (9 columns a round).
  const p4 = storm(17);
  assert.ok(p4.checks.some((c) => c.severity === "warning" && c.text.includes("pirate 4")), p4.checks.map((c) => c.text).join(" / "));
  // Column 19: not even with pirate 4; only luck or straight-moving pirates. Still publishable.
  const luck = storm(19);
  assert.ok(luck.checks.some((c) => c.severity === "warning" && c.text.includes("even with ideal cards")));
  assert.equal(luck.canPublish, true);

  const easy = analyze({ ...emptyLayout(), end: "D11", storms: [5] });
  assert.equal(easy.best?.round, 2);
  assert.ok(easy.route && easy.route.moveRounds.every((r, i, a) => i === 0 || r >= a[i - 1]));
});

test("storm deadlines: first by round 2, second by round 4", () => {
  const l = { ...emptyLayout(), end: "D25", storms: [9, 18] };
  const a = analyze(l);
  assert.deepEqual(
    a.storms.map((s) => [s.column, s.deadlineRound]),
    [
      [9, 2],
      [18, 4],
    ],
  );
  assert.ok(a.canPublish);
});
