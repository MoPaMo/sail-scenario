import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import {
  CENSOR_TARGETS,
  ENGLISH_WHITELIST,
  HATE_PATTERNS,
  PHRASES,
  ROOTS,
  WHITELIST,
  WINDOW_ROOTS,
  type Root,
} from "./profanity-data";

/**
 * Profanity filter shared by the editor (live feedback) and the API (the check
 * that counts). It is built for short titles and names, and errs towards
 * letting ordinary words through: real place names, birds, food and words from
 * other languages that happen to look rude.
 *
 * Layers:
 *  1. Hate symbols and codes (swastikas, SS runes, 1488, 🖕).
 *  2. English: obscenity's curated dataset, which handles leetspeak and
 *     look-alike characters, plus extra innocent phrases ("Booby Island").
 *  3. Other languages and extra English slurs: curated patterns
 *     (profanity-data.ts) matched per word, with word-boundary rules.
 *  4. Evasions: invisible characters, Cyrillic/Greek look-alikes, accents,
 *     digits and symbols for letters ("sh1t", "4rsch"), stretched letters
 *     ("fuuuuck"), letters split by spaces or dots ("f u c k", "wich ser"),
 *     and censored spellings ("f*ck").
 */

/* ---------------------------------------------------------------- */
/* English matcher                                                   */
/* ---------------------------------------------------------------- */

const english = (() => {
  const built = englishDataset.build();
  return new RegExpMatcher({
    blacklistedTerms: built.blacklistedTerms,
    whitelistedTerms: [...(built.whitelistedTerms ?? []), ...ENGLISH_WHITELIST],
    ...englishRecommendedTransformers,
  });
})();

/* ---------------------------------------------------------------- */
/* Normalisation                                                     */
/* ---------------------------------------------------------------- */

// Format characters (zero-width spaces/joiners, soft hyphen, bidi controls, BOM)
// plus a few invisible fillers that aren't in \p{Cf}.
const INVISIBLE = /[\p{Cf}͏ᅟᅠ឴឵᠋-᠏ㅤ︀-️]/gu;

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "€": "e", "!": "i", "|": "i",
};

// Cyrillic and Greek letters that look like Latin ones ("fuсk" with a Cyrillic с).
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", ү: "y", һ: "h", ԛ: "q", ԝ: "w",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ς: "s", ω: "w",
};

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s);
const hasLetter = (s: string) => /\p{L}/u.test(s);

function toLatin(s: string, spellUmlauts: boolean): string {
  let t = "";
  for (const ch of s) t += HOMOGLYPHS[ch] ?? ch;
  t = t.replace(/ß/g, "ss");
  if (spellUmlauts) t = t.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  return t.normalize("NFKD").replace(/\p{M}/gu, "");
}

const collapse3 = (s: string) => s.replace(/(\p{L})\1{2,}/gu, "$1$1"); // "fuuuuck" -> "fuuck"
const collapse1 = (s: string) => s.replace(/(\p{L})\1+/gu, "$1"); // "fuuuuck" -> "fuck"

type ViewName = "raw" | "spelled" | "stripped";

interface View {
  /** Words in reading order (separators removed). */
  words: string[];
  /** Every candidate word: plain, with digits/symbols read as letters, and joined across dots or dashes. */
  candidates: Set<string>;
}

function buildViews(text: string): Record<ViewName, View> {
  const raw = text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();
  // Possessive 's is dropped so "Nazir's" isn't read as "nazirs".
  const chunks = raw.replace(/['’]s(?=$|[^\p{L}])/gu, "").split(/\s+/).filter(Boolean);
  const transforms: Record<ViewName, (s: string) => string> = {
    raw: (s) => s,
    spelled: (s) => toLatin(s, true),
    stripped: (s) => toLatin(s, false),
  };
  const views = {} as Record<ViewName, View>;
  for (const name of Object.keys(transforms) as ViewName[]) {
    const tf = transforms[name];
    const words: string[] = [];
    const candidates = new Set<string>();
    for (const chunk of chunks) {
      const plain = tf(chunk);
      const leet = hasLetter(chunk) ? tf([...chunk].map((c) => LEET[c] ?? c).join("")) : plain;
      for (const variant of [plain, leet]) {
        const parts = variant.split(/[^\p{L}]+/u).filter(Boolean);
        parts.forEach((w) => candidates.add(w));
        const joined = parts.join("");
        if (parts.length > 1 && joined.length >= 3) candidates.add(joined); // "f-u-c-k", "sch.eisse"
      }
      words.push(...plain.split(/[^\p{L}]+/u).filter(Boolean));
    }
    views[name] = { words, candidates };
  }
  return views;
}

/* ---------------------------------------------------------------- */
/* Pattern matching                                                  */
/* ---------------------------------------------------------------- */

function matchesRoot(word: string, root: Root): boolean {
  const test = (w: string, p: string) =>
    root.m === "word" ? w === p : root.m === "start" ? w.startsWith(p) : w.includes(p);
  if (test(word, root.p) || test(collapse3(word), root.p)) return true;
  // Stretched letters ("fuuck", "wiichser"): compare with doubled letters squeezed
  // on both sides, but only for words that actually contain a doubled letter,
  // or "Vitus" would match "vittu".
  const w1 = collapse1(word);
  const p1 = collapse1(root.p);
  return w1 !== word && p1.length >= 4 && test(w1, p1);
}

function viewsFor(root: Root): ViewName[] {
  if (!isAscii(root.p)) return ["raw"];
  return root.view ? [root.view] : ["spelled", "stripped"];
}

function findRoot(views: Record<ViewName, View>, roots: Root[], words: (v: View) => Iterable<string>): Root | null {
  for (const root of roots) {
    for (const name of viewsFor(root)) {
      for (const w of words(views[name])) {
        if (!WHITELIST.has(w) && matchesRoot(w, root)) return root;
      }
    }
  }
  return null;
}

/**
 * Words split into pieces: "wich ser", "fu ck". Joins runs of 2–3 neighbouring
 * words when all but one are at most 3 letters, so that real word pairs
 * ("Fisch Eis") aren't glued into something rude.
 */
function windows(words: string[]): string[] {
  const out: string[] = [];
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const group = words.slice(i, i + size);
      if (group.filter((w) => w.length <= 3).length >= size - 1) out.push(group.join(""));
    }
  }
  return out;
}

/** Runs of single letters split by spaces or punctuation: "f u c k", "f.u.c.k". */
const SPACED_LETTERS = /(?:^|[^\p{L}])((?:\p{L}[\s._*\-+~]+){2,}\p{L})(?=$|[^\p{L}])/gu;

/** "f*ck", "sh**", "a**hole": each run of * or # stands for one more letter at most. */
function censoredMatch(raw: string): string | null {
  for (const chunk of raw.toLowerCase().split(/[^\p{L}*#]+/u)) {
    if (!/[*#]/.test(chunk) || (chunk.match(/\p{L}/gu) ?? []).length < 1 || chunk.replace(/[*#]/g, "").length === 0) continue;
    if (!/^\p{L}/u.test(chunk) && !/\p{L}$/u.test(chunk)) continue;
    const re = new RegExp(
      "^" + chunk.replace(/[*#]+/g, (run) => `[a-z]{${run.length},${run.length + 1}}`) + "$",
    );
    const hit = CENSOR_TARGETS.find((t) => re.test(t));
    if (hit) return hit;
  }
  return null;
}

/**
 * The rule that matched, or null. Meant for tests and logs; users only see a
 * generic message, so the filter can't be probed word by word.
 */
export function findProfanity(text: string): string | null {
  if (!text || !text.trim()) return null;
  const raw = text.normalize("NFKC").replace(INVISIBLE, "");

  for (const re of HATE_PATTERNS) if (re.test(raw)) return `hate:${re.source}`;

  const views = buildViews(text);
  const strippedText = views.stripped.words.join(" ");

  // English, on the text as typed and with look-alike letters resolved.
  if (english.hasMatch(raw.toLowerCase()) || english.hasMatch(toLatin(raw.toLowerCase(), false))) return "english";

  const root = findRoot(views, ROOTS, (v) => v.candidates);
  if (root) return `${root.m}:${root.p}`;

  for (const name of ["spelled", "stripped"] as const) {
    const sentence = ` ${views[name].words.join(" ")} `;
    const phrase = PHRASES.find((ph) => sentence.includes(` ${ph} `));
    if (phrase) return `phrase:${phrase}`;
  }

  const pieces = findRoot(views, [...ROOTS, ...WINDOW_ROOTS], (v) => windows(v.words));
  if (pieces) return `split:${pieces.p}`;

  for (const source of [raw, strippedText]) {
    for (const m of source.matchAll(SPACED_LETTERS)) {
      const joined = toLatin(m[1].toLowerCase(), false).replace(/[^\p{L}]/gu, "");
      if (english.hasMatch(joined)) return `spaced:${joined}`;
      const hit = [...ROOTS, ...WINDOW_ROOTS].find((r) => isAscii(r.p) && matchesRoot(joined, r));
      if (hit) return `spaced:${hit.p}`;
    }
  }

  const censored = censoredMatch(raw);
  if (censored) return `censored:${censored}`;

  return null;
}

export function containsProfanity(text: string): boolean {
  return findProfanity(text) !== null;
}

/* ---------------------------------------------------------------- */
/* Field checks used by the editor and the API                       */
/* ---------------------------------------------------------------- */

export const TITLE_MIN = 3;
export const TITLE_MAX = 60;

export interface TextCheck {
  ok: boolean;
  message?: string;
}

const LINK_RE = /(https?:\/\/|www\.|\.(com|net|org|io|de|ru|xyz)\b)/i;

export function checkTitle(raw: string): TextCheck {
  const title = cleanTitle(raw);
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
  return raw.normalize("NFKC").replace(INVISIBLE, "").trim().replace(/\s+/g, " ");
}
