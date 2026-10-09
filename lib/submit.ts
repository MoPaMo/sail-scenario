import { analyze } from "./analysis";
import { editLinkEmail, isValidEmail, type Mailer } from "./email";
import { createEditKey, editKeyMatches } from "./editKey";
import { checkFreeText, checkTitle, cleanTitle } from "./profanity";
import { parseLayout, usesExpansion, type Layout } from "./scenario";
import { ID_RE, newId, type ScenarioRecord, type ScenarioStore } from "./store";
import { captchaMode, type CaptchaVerifier } from "./turnstile";

export const AUTHOR_MAX = 40;
export const NOTES_MAX = 400;
export const RATE_LIMIT = { max: 5, windowSeconds: 600 };
export const EDIT_RATE_LIMIT = { max: 30, windowSeconds: 600 };

type Field = "title" | "author" | "notes" | "layout" | "captcha" | "email";

export type ApiFailure = { ok: false; error: string; field?: Field; details?: string[] };

export interface SubmitResponse {
  status: number;
  body:
    | {
        ok: true;
        id: string;
        url: string;
        storage: ScenarioStore["kind"];
        /** "sent" when the edit link went out by email, "failed" when it didn't (then editUrl is included once). */
        email?: "sent" | "failed";
        editUrl?: string;
      }
    | ApiFailure;
}

export interface SimpleResponse {
  status: number;
  body: { ok: true; id?: string; url?: string } | ApiFailure;
}

const fail = (status: number, error: string, field?: Field, details?: string[]) => ({
  status,
  body: { ok: false as const, error, field, details },
});

const str = (v: unknown) => (typeof v === "string" ? v : "");

interface CleanScenario {
  title: string;
  author: string;
  notes: string;
  layout: Layout;
  stats: ScenarioRecord["stats"];
}

/** Everything a scenario must pass, whether it's new or edited. */
function validateScenario(body: Record<string, unknown>): { ok: true; value: CleanScenario } | { ok: false; res: ReturnType<typeof fail> } {
  const title = cleanTitle(str(body.title));
  const titleCheck = checkTitle(title);
  if (!titleCheck.ok) return { ok: false, res: fail(400, titleCheck.message!, "title") };

  const author = str(body.author).trim().replace(/\s+/g, " ");
  const authorCheck = checkFreeText(author, "Your name", AUTHOR_MAX);
  if (!authorCheck.ok) return { ok: false, res: fail(400, authorCheck.message!, "author") };

  const notes = str(body.notes).trim();
  const notesCheck = checkFreeText(notes, "Notes", NOTES_MAX);
  if (!notesCheck.ok) return { ok: false, res: fail(400, notesCheck.message!, "notes") };

  const { layout, problems } = parseLayout(body.layout);
  if (problems.length) return { ok: false, res: fail(400, "The layout breaks the game's rules.", "layout", problems) };
  const analysis = analyze(layout);
  if (!analysis.canPublish) return { ok: false, res: fail(400, "Fix the layout before publishing.", "layout", analysis.errors) };

  return {
    ok: true,
    value: {
      title,
      author,
      notes,
      layout: usesExpansion(layout) ? layout : { ...layout, whirlpools: [], allies: [], crowsNests: [] },
      stats: {
        columns: analysis.columns ?? 0,
        moves: analysis.fastest?.moves ?? 0,
        krakenHits: analysis.safest?.krakenHits ?? 0,
      },
    },
  };
}

export interface SubmitDeps {
  store: ScenarioStore;
  verify: CaptchaVerifier;
  /** Present when email is configured. */
  mailer?: Mailer;
  siteUrl?: string;
  now?: () => Date;
}

/**
 * POST /api/scenarios, minus HTTP plumbing. Cheap checks run first; the
 * captcha token is only spent on a valid scenario. If the author gave an
 * email address, a private edit key is created, only its hash is stored,
 * and the link is emailed. The address itself is not kept anywhere.
 */
export async function handleSubmission(input: unknown, ip: string | null, deps: SubmitDeps): Promise<SubmitResponse> {
  if (!input || typeof input !== "object") return fail(400, "Send the scenario as a JSON object.");
  const body = input as Record<string, unknown>;

  const checked = validateScenario(body);
  if (!checked.ok) return checked.res;

  const email = str(body.email).trim();
  if (email) {
    if (!deps.mailer) return fail(400, "Edit links by email aren't set up on this site.", "email");
    if (!isValidEmail(email)) return fail(400, "That email address doesn't look right.", "email");
  }

  const mode = captchaMode();
  if (mode === "misconfigured") {
    return fail(500, "The captcha is half configured: set both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.");
  }

  if (!(await deps.store.hit(`submit:${ip ?? "unknown"}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
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

  const edit = email ? createEditKey() : null;
  const record: ScenarioRecord = {
    id: newId(),
    ...checked.value,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
    ...(edit ? { editKeyHash: edit.hash } : {}),
  };
  await deps.store.save(record);

  const url = `/s/${record.id}`;
  if (!edit || !deps.mailer) return { status: 201, body: { ok: true, id: record.id, url, storage: deps.store.kind } };

  const base = deps.siteUrl ?? "";
  const editUrl = `${base}/s/${record.id}/edit#k=${edit.key}`;
  const sent = await deps.mailer(editLinkEmail(email, record.title, `${base}${url}`, editUrl));
  return {
    status: 201,
    body: sent.ok
      ? { ok: true, id: record.id, url, storage: deps.store.kind, email: "sent" }
      : // The email didn't go out: hand the link to the author this once rather than lose it.
        { ok: true, id: record.id, url, storage: deps.store.kind, email: "failed", editUrl },
  };
}

interface KeyedDeps {
  store: ScenarioStore;
  now?: () => Date;
}

async function authorize(id: string, key: string | null, ip: string | null, deps: KeyedDeps) {
  if (!ID_RE.test(id)) return { ok: false as const, res: fail(404, "That scenario doesn't exist.") };
  if (!(await deps.store.hit(`edit:${ip ?? "unknown"}`, EDIT_RATE_LIMIT.max, EDIT_RATE_LIMIT.windowSeconds))) {
    return { ok: false as const, res: fail(429, "Too many edits from your connection in the last 10 minutes. Try again later.") };
  }
  const rec = await deps.store.get(id);
  if (!rec) return { ok: false as const, res: fail(404, "That scenario doesn't exist.") };
  if (!editKeyMatches(key, rec.editKeyHash)) {
    return { ok: false as const, res: fail(403, "This edit link isn't valid for this scenario.") };
  }
  return { ok: true as const, rec };
}

/** Check an edit key without changing anything (the edit page calls this on load). */
export async function handleAccess(id: string, key: string | null, ip: string | null, deps: KeyedDeps): Promise<SimpleResponse> {
  const auth = await authorize(id, key, ip, deps);
  return auth.ok ? { status: 200, body: { ok: true, id } } : auth.res;
}

/** PATCH /api/scenarios/:id: replace title, author, notes and layout. */
export async function handleUpdate(
  id: string,
  key: string | null,
  input: unknown,
  ip: string | null,
  deps: KeyedDeps,
): Promise<SimpleResponse> {
  if (!input || typeof input !== "object") return fail(400, "Send the scenario as a JSON object.");
  const auth = await authorize(id, key, ip, deps);
  if (!auth.ok) return auth.res;
  const checked = validateScenario(input as Record<string, unknown>);
  if (!checked.ok) return checked.res;
  await deps.store.save({
    ...auth.rec,
    ...checked.value,
    updatedAt: (deps.now?.() ?? new Date()).toISOString(),
  });
  return { status: 200, body: { ok: true, id, url: `/s/${id}` } };
}

/** DELETE /api/scenarios/:id with the author's edit key. */
export async function handleOwnerDelete(id: string, key: string | null, ip: string | null, deps: KeyedDeps): Promise<SimpleResponse> {
  const auth = await authorize(id, key, ip, deps);
  if (!auth.ok) return auth.res;
  await deps.store.remove(id);
  return { status: 200, body: { ok: true, id } };
}
