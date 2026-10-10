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
      const i = saved.findIndex((x) => x.id === r.id);
      if (i >= 0) saved[i] = r;
      else saved.push(r);
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
  const res = await handleSubmission({ title: "  Kraken   Alley ", author: "Moritz", notes: "", layout: custom, captchaToken: "t" }, "1.2.3.4", { store, verify: pass, estimate: () => 0.5 });
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
    estimate: () => 0.5,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.equal(!res.body.ok && res.body.field, "title");
  assert.equal(captchaCalls, 0);
  assert.equal(store.saved.length, 0);
});

test("rejects a failed captcha", async () => {
  const store = fakeStore();
  const res = await handleSubmission({ title: "Kraken Alley", layout: custom, captchaToken: "bad" }, null, { store, verify: failCaptcha, estimate: () => 0.5 });
  assert.equal(res.status, 403);
  assert.equal(store.saved.length, 0);
});

test("rejects rule-breaking and copied layouts", async () => {
  const store = fakeStore();
  const tooMany = { ...custom, kraken: ["A4", "A6", "A8", "A10", "A12", "A14", "A16", "A18", "A20", "A22"] };
  const r1 = await handleSubmission({ title: "Ten Krakens", layout: tooMany, captchaToken: "t" }, null, { store, verify: pass, estimate: () => 0.5 });
  assert.equal(r1.status, 400);
  const r2 = await handleSubmission({ title: "Not Mine", layout: OFFICIAL_SCENARIOS[2].layout, captchaToken: "t" }, null, { store, verify: pass, estimate: () => 0.5 });
  assert.equal(r2.status, 400);
  assert.ok(!r2.body.ok && r2.body.details?.some((d) => d.includes("exactly as printed")));
});

test("rate limits repeated submissions from one address", async () => {
  const store = fakeStore();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await handleSubmission({ title: `Run ${i + 1} Reef`, layout: custom, captchaToken: "t" }, "9.9.9.9", { store, verify: pass, estimate: () => 0.5 });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
});

/* ------------------------------------------------------------------ */
/* Edit links by email                                                 */
/* ------------------------------------------------------------------ */

import { editLinkEmail } from "../lib/email";
import { hashEditKey } from "../lib/editKey";
import { handleAccess, handleOwnerDelete, handleUpdate } from "../lib/submit";
import { toPublic } from "../lib/store";

function capturingMailer(ok = true) {
  const sent: { to: string; subject: string; html: string; text: string }[] = [];
  return { sent, mailer: async (m: (typeof sent)[number]) => (sent.push(m), { ok }) };
}

async function publishWithEmail(store: ReturnType<typeof fakeStore>, ok = true) {
  const mail = capturingMailer(ok);
  const res = await handleSubmission(
    { title: "Kraken Alley", layout: custom, captchaToken: "t", email: "Captain@Example.org" },
    "1.1.1.1",
    { store, verify: pass, mailer: mail.mailer, siteUrl: "https://sail.mopamo.dev", estimate: () => 0.5 },
  );
  const key = /#k=([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? (res.body.ok ? res.body.editUrl ?? "" : ""))?.[1] ?? "";
  return { res, mail, key };
}

test("email: sends the edit link and stores neither the address nor the key", async () => {
  const store = fakeStore();
  const { res, mail, key } = await publishWithEmail(store);
  assert.equal(res.status, 201);
  assert.ok(res.body.ok && res.body.email === "sent" && !res.body.editUrl, "link isn't echoed back when the email went out");
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, "Captain@Example.org");
  assert.match(mail.sent[0].text, /https:\/\/sail\.mopamo\.dev\/s\/[a-z0-9]{10}\/edit#k=/);
  assert.equal(key.length, 43);
  const stored = JSON.stringify(store.saved[0]);
  assert.ok(!/example\.org/i.test(stored), "email address must not be stored");
  assert.ok(!stored.includes(key), "edit key must not be stored");
  assert.equal(store.saved[0].editKeyHash, hashEditKey(key));
  assert.ok(!("editKeyHash" in toPublic(store.saved[0])), "hash never leaves the server");
});

test("email: when sending fails, the link is returned once instead", async () => {
  const store = fakeStore();
  const { res, key } = await publishWithEmail(store, false);
  assert.ok(res.body.ok && res.body.email === "failed");
  assert.ok(res.body.ok && res.body.editUrl?.endsWith(`#k=${key}`));
});

test("email: rejected when invalid or when email isn't configured", async () => {
  const store = fakeStore();
  const bad = await handleSubmission({ title: "Kraken Alley", layout: custom, captchaToken: "t", email: "not-an-email" }, null, {
    store,
    verify: pass,
    mailer: capturingMailer().mailer,
    estimate: () => 0.5,
  });
  assert.equal(bad.status, 400);
  assert.ok(!bad.body.ok && bad.body.field === "email");
  const off = await handleSubmission({ title: "Kraken Alley", layout: custom, captchaToken: "t", email: "a@b.org" }, null, { store, verify: pass, estimate: () => 0.5 });
  assert.equal(off.status, 400);
  assert.equal(store.saved.length, 0);
});

test("email: the message escapes the title and contains both links", () => {
  const m = editLinkEmail("a@b.org", `Kraken <b>"Alley"</b>`, "https://x.dev/s/abc", "https://x.dev/s/abc/edit#k=KEY");
  assert.ok(m.html.includes("Kraken &lt;b&gt;&quot;Alley&quot;&lt;/b&gt;"));
  assert.ok(!m.html.includes("<b>\"Alley\""));
  assert.ok(m.text.includes("https://x.dev/s/abc/edit#k=KEY") && m.text.includes("https://x.dev/s/abc"));
});

test("edit: right key updates, wrong key and keyless scenarios are refused", async () => {
  const store = fakeStore();
  const { res, key } = await publishWithEmail(store);
  const id = res.body.ok ? res.body.id : "";
  const deps = { store, now: () => new Date("2026-10-11T10:00:00Z"), estimate: () => 0.4 };

  assert.equal((await handleAccess(id, key, "2.2.2.2", deps)).status, 200);
  assert.equal((await handleAccess(id, "x".repeat(43), "2.2.2.2", deps)).status, 403);
  assert.equal((await handleAccess(id, null, "2.2.2.2", deps)).status, 403);
  assert.equal((await handleAccess("zzzzzzzzzz", key, "2.2.2.2", deps)).status, 404);

  const changed = { title: "Kraken Alley Revisited", author: "M", notes: "Harder now", layout: { ...custom, kraken: [...custom.kraken, "B11"] } };
  const ok = await handleUpdate(id, key, changed, "2.2.2.2", deps);
  assert.equal(ok.status, 200);
  const rec = await store.get(id);
  assert.equal(rec?.title, "Kraken Alley Revisited");
  assert.equal(rec?.updatedAt, "2026-10-11T10:00:00.000Z");
  assert.equal(rec?.editKeyHash, hashEditKey(key), "key keeps working after an edit");

  assert.equal((await handleUpdate(id, "wrong-key-wrong-key-wrong-key", changed, "2.2.2.2", deps)).status, 403);
  assert.equal((await handleUpdate(id, key, { ...changed, title: "Shit Storm" }, "2.2.2.2", deps)).status, 400);

  // A scenario published without an email can't be edited by anyone.
  const plain = await handleSubmission({ title: "No Email Reef", layout: custom, captchaToken: "t" }, "3.3.3.3", { store, verify: pass, estimate: () => 0.5 });
  const plainId = plain.body.ok ? plain.body.id : "";
  assert.equal((await handleUpdate(plainId, key, changed, "2.2.2.2", deps)).status, 403);
});

test("edit: the author can delete with the key", async () => {
  const store = fakeStore();
  const { res, key } = await publishWithEmail(store);
  const id = res.body.ok ? res.body.id : "";
  assert.equal((await handleOwnerDelete(id, "nope-nope-nope-nope-nope", "4.4.4.4", { store })).status, 403);
  // fakeStore.remove always reports true, so check via the response.
  assert.equal((await handleOwnerDelete(id, key, "4.4.4.4", { store })).status, 200);
});
