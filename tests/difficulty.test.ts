import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateDifficulty } from "../lib/difficulty";
import { compareWithBook, difficultyLevel, OFFICIAL_WIN_RATES } from "../lib/difficultyScale";
import { OFFICIAL_SCENARIOS } from "../lib/official";

test("the difficulty scale matches the engine (update OFFICIAL_WIN_RATES if the simulation changes)", () => {
  for (const o of OFFICIAL_WIN_RATES) {
    const s = OFFICIAL_SCENARIOS.find((x) => x.slug === o.slug)!;
    assert.equal(estimateDifficulty(s.layout)!.winRate, o.winRate, o.name);
  }
});

test("difficulty labels and comparisons", () => {
  assert.equal(difficultyLevel(0.95).label, "Easy");
  assert.equal(difficultyLevel(0.5).label, "Hard");
  assert.equal(difficultyLevel(0.01).label, "Nearly impossible");
  assert.equal(compareWithBook(0.75), "About as hard as Scenario 3");
  assert.equal(compareWithBook(0.5), "Between Scenario 3 and Scenario 4");
  assert.equal(compareWithBook(0.05), "Harder than Scenario 5");
  assert.equal(compareWithBook(1), "About as hard as the Learning scenario");
});
