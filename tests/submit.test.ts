import assert from "node:assert/strict";
import { test } from "node:test";
import { containsProfanity, checkTitle } from "../lib/profanity";
import { OFFICIAL_SCENARIOS } from "../lib/official";
import type { ScenarioRecord, ScenarioStore } from "../lib/store";
import { handleSubmission } from "../lib/submit";

function fakeStore(): ScenarioStore & { saved: ScenarioRecord[] } {
  const saved: ScenarioRecord[] = [];
  const hits = new Map<string, number>();
  return {
    kind: "memory",
    saved,
    async save(r) {
      saved.push(r);
    },
    async get(id) {
      return saved.find((r) => r.id === id) ?? null;
    },
    async list() {
      return { items: saved, total: saved.length };
    },
    async remove() {
      return true;
    },
    async hit(key, max) {
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return n <= max;
    },
  };
}

const pass = async () => ({ success: true, codes: [] });
const failCaptcha = async () => ({ success: false, codes: ["invalid-input-response"] });

const custom = { ...OFFICIAL_SCENARIOS[1].layout, kraken: [...OFFICIAL_SCENARIOS[1].layout.kraken, "D9"] };

test("profanity: blocks English and German, spares nautical words", () => {
  for (const t of ["Kraken's Ass", "Sh1t Storm", "f u c k off", "F.U.C.K Bay", "Scheiß Sturm", "Arschloch Atoll", "Fick dich", "Whore Island"]) {
    assert.equal(containsProfanity(t), true, t);
  }
  for (const t of ["Cockpit Cove", "Moby Dick", "Fickle Winds", "Barsch Bucht", "Fischschwanz-Passage", "Pirate's Booty", "Scunthorpe Shoals", "Assassin's Reef", "Moss Hitch", "Hell's Gate"]) {
    assert.equal(containsProfanity(t), false, t);
  }
  assert.equal(checkTitle("Visit www.spam.example").ok, false);
  assert.equal(checkTitle("ab").ok, false);
});

test("publishes a valid scenario", async () => {
  const store = fakeStore();
  const res = await handleSubmission({ title: "  Kraken   Alley ", author: "Moritz", notes: "", layout: custom, captchaToken: "t" }, "1.2.3.4", { store, verify: pass });
  assert.equal(res.status, 201);
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].title, "Kraken Alley");
  assert.equal(store.saved[0].stats.columns, 16);
});

test("rejects a profane title before spending the captcha", async () => {
  const store = fakeStore();
  let captchaCalls = 0;
  const res = await handleSubmission({ title: "Shit Storm", layout: custom, captchaToken: "t" }, null, {
    store,
    verify: async () => {
      captchaCalls++;
      return { success: true, codes: [] };
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.equal(!res.body.ok && res.body.field, "title");
  assert.equal(captchaCalls, 0);
  assert.equal(store.saved.length, 0);
});

test("rejects a failed captcha", async () => {
  const store = fakeStore();
  const res = await handleSubmission({ title: "Kraken Alley", layout: custom, captchaToken: "bad" }, null, { store, verify: failCaptcha });
  assert.equal(res.status, 403);
  assert.equal(store.saved.length, 0);
});

test("rejects rule-breaking and copied layouts", async () => {
  const store = fakeStore();
  const tooMany = { ...custom, kraken: ["A4", "A6", "A8", "A10", "A12", "A14", "A16", "A18", "A20", "A22"] };
  const r1 = await handleSubmission({ title: "Ten Krakens", layout: tooMany, captchaToken: "t" }, null, { store, verify: pass });
  assert.equal(r1.status, 400);
  const r2 = await handleSubmission({ title: "Not Mine", layout: OFFICIAL_SCENARIOS[2].layout, captchaToken: "t" }, null, { store, verify: pass });
  assert.equal(r2.status, 400);
  assert.ok(!r2.body.ok && r2.body.details?.some((d) => d.includes("exactly as printed")));
});

test("rate limits repeated submissions from one address", async () => {
  const store = fakeStore();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await handleSubmission({ title: `Run ${i + 1} Reef`, layout: custom, captchaToken: "t" }, "9.9.9.9", { store, verify: pass });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
});
