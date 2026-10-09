import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  pattern,
} from "obscenity";

/**
 * Profanity filter shared by the editor (instant feedback) and the API
 * (the check that actually counts).
 *
 * - English: obscenity's curated dataset, which resolves leetspeak and
 *   look-alike characters ("sh1t", "ſhit") and whitelists innocent words
 *   ("Scunthorpe", "assassin").
 * - German: a small extra list, since many Sail players are German-speaking.
 * - Letters spelled out with gaps ("f u c k", "f.u.c.k") are rejoined and checked.
 */

// German terms. `|` marks a word boundary so that e.g. "Barsch" (perch)
// doesn't trip "arsch". "Schwanz" is left out on purpose: it is also the
// German word for the fish tail on Sail's cards.
const GERMAN_PATTERNS = [
  pattern`scheis`,
  pattern`|arsch`,
  pattern`|fick`,
  pattern`fotze`,
  pattern`hurensohn`,
  pattern`|hure`,
  pattern`|wichs`,
  pattern`schlampe`,
  pattern`missgeburt`,
  pattern`|spast`,
  pattern`schwuchtel`,
  pattern`|kanake`,
  pattern`|neger|`,
  pattern`|nazi`,
  pattern`hitler`,
  pattern`verpiss`,
  pattern`pimmel`,
  pattern`titten`,
];

// Innocent phrases the English dataset would otherwise flag.
const EXTRA_WHITELIST = ["cockpit", "cockpits", "moby dick", "fickle", "peacock", "shuttlecock", "weathercock", "woodcock"];

const dataset = new DataSet<{ originalWord: string }>().addAll(englishDataset);
GERMAN_PATTERNS.forEach((p, i) => {
  dataset.addPhrase((phrase) => phrase.setMetadata({ originalWord: `de-${i}` }).addPattern(p));
});
const built = dataset.build();

// The English dataset whitelists "fick" (to protect a "dick" variant), which
// would cancel the German pattern above, so it is dropped here.
const DROP_FROM_WHITELIST = new Set(["fick"]);

const matcher = new RegExpMatcher({
  blacklistedTerms: built.blacklistedTerms,
  whitelistedTerms: [...(built.whitelistedTerms ?? []).filter((w) => !DROP_FROM_WHITELIST.has(w)), ...EXTRA_WHITELIST],
  ...englishRecommendedTransformers,
});

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/ß/g, "ss")
    .replace(/ẞ/g, "SS")
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue");
}

/** Runs of three or more single letters split by spaces or punctuation: "f u c k", "f.u.c.k". */
const SPACED_LETTERS = /(?:^|[^\p{L}])((?:\p{L}[\s._*\-+~]+){2,}\p{L})(?=$|[^\p{L}])/gu;

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const t = normalize(text);
  if (matcher.hasMatch(t)) return true;
  for (const m of t.matchAll(SPACED_LETTERS)) {
    const joined = m[1].replace(/[^\p{L}]/gu, "");
    if (matcher.hasMatch(joined)) return true;
  }
  return false;
}

export const TITLE_MIN = 3;
export const TITLE_MAX = 60;

export interface TextCheck {
  ok: boolean;
  message?: string;
}

const LINK_RE = /(https?:\/\/|www\.|\.(com|net|org|io|de|ru|xyz)\b)/i;

export function checkTitle(raw: string): TextCheck {
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length < TITLE_MIN) return { ok: false, message: `Give the scenario a name of at least ${TITLE_MIN} characters.` };
  if (title.length > TITLE_MAX) return { ok: false, message: `Keep the name under ${TITLE_MAX + 1} characters.` };
  if (!/\p{L}/u.test(title)) return { ok: false, message: "The name needs at least one letter." };
  if (LINK_RE.test(title)) return { ok: false, message: "Links aren't allowed in the name." };
  if (containsProfanity(title)) return { ok: false, message: "This name contains language that isn't allowed. Pick another." };
  return { ok: true };
}

export function checkFreeText(raw: string, field: string, max: number): TextCheck {
  const text = raw.trim();
  if (text.length > max) return { ok: false, message: `${field} can be at most ${max} characters.` };
  if (containsProfanity(text)) return { ok: false, message: `${field} contains language that isn't allowed.` };
  return { ok: true };
}

export function cleanTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
