import { analyze } from "./analysis";
import { checkFreeText, checkTitle, cleanTitle } from "./profanity";
import { parseLayout, usesExpansion } from "./scenario";
import { newId, type ScenarioRecord, type ScenarioStore } from "./store";
import { captchaMode, type CaptchaVerifier } from "./turnstile";

export const AUTHOR_MAX = 40;
export const NOTES_MAX = 400;
export const RATE_LIMIT = { max: 5, windowSeconds: 600 };

export interface SubmitResponse {
  status: number;
  body:
    | { ok: true; id: string; url: string; storage: ScenarioStore["kind"] }
    | { ok: false; error: string; field?: "title" | "author" | "notes" | "layout" | "captcha"; details?: string[] };
}

const fail = (
  status: number,
  error: string,
  field?: "title" | "author" | "notes" | "layout" | "captcha",
  details?: string[],
): SubmitResponse => ({ status, body: { ok: false, error, field, details } });

/**
 * Everything the POST /api/scenarios route does, minus HTTP plumbing,
 * so it can be tested with a fake store and captcha verifier.
 * Cheap checks run first; the captcha token is only spent on a valid scenario.
 */
export async function handleSubmission(
  input: unknown,
  ip: string | null,
  deps: { store: ScenarioStore; verify: CaptchaVerifier; now?: () => Date },
): Promise<SubmitResponse> {
  if (!input || typeof input !== "object") return fail(400, "Send the scenario as a JSON object.");
  const body = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const title = cleanTitle(str(body.title));
  const titleCheck = checkTitle(title);
  if (!titleCheck.ok) return fail(400, titleCheck.message!, "title");

  const author = str(body.author).trim().replace(/\s+/g, " ");
  const authorCheck = checkFreeText(author, "Your name", AUTHOR_MAX);
  if (!authorCheck.ok) return fail(400, authorCheck.message!, "author");

  const notes = str(body.notes).trim();
  const notesCheck = checkFreeText(notes, "Notes", NOTES_MAX);
  if (!notesCheck.ok) return fail(400, notesCheck.message!, "notes");

  const { layout, problems } = parseLayout(body.layout);
  if (problems.length) return fail(400, "The layout breaks the game's rules.", "layout", problems);
  const analysis = analyze(layout);
  if (!analysis.canPublish) return fail(400, "Fix the layout before publishing.", "layout", analysis.errors);

  const mode = captchaMode();
  if (mode === "misconfigured") {
    return fail(500, "The captcha is half configured: set both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.");
  }

  const rateKey = ip ?? "unknown";
  if (!(await deps.store.hit(`submit:${rateKey}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return fail(429, "Too many scenarios from your connection in the last 10 minutes. Try again later.");
  }

  const captcha = await deps.verify(str(body.captchaToken), ip);
  if (!captcha.success) {
    const unavailable = captcha.codes.includes("verification-unavailable");
    return fail(
      unavailable ? 502 : 403,
      unavailable
        ? "The captcha service didn't respond. Try again in a moment."
        : "The captcha check failed or expired. Complete it again, then publish.",
      "captcha",
    );
  }

  const record: ScenarioRecord = {
    id: newId(),
    title,
    author,
    notes,
    layout: usesExpansion(layout) ? layout : { ...layout, whirlpools: [], allies: [], crowsNests: [] },
    stats: {
      columns: analysis.columns ?? 0,
      moves: analysis.fastest?.moves ?? 0,
      krakenHits: analysis.safest?.krakenHits ?? 0,
    },
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  await deps.store.save(record);
  return { status: 201, body: { ok: true, id: record.id, url: `/s/${record.id}`, storage: deps.store.kind } };
}
