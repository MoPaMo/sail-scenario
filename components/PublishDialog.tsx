"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/analysis";
import { checkFreeText, checkTitle, TITLE_MAX } from "@/lib/profanity";
import type { Layout } from "@/lib/scenario";
import Turnstile, { type TurnstileHandle } from "./Turnstile";

export interface PublishConfig {
  siteKey: string;
  captchaMode: "live" | "test" | "misconfigured";
  storage: "redis" | "memory";
}

const AUTHOR_MAX = 40;
const NOTES_MAX = 400;

type Field = "title" | "author" | "notes" | "layout" | "captcha";

export default function PublishDialog({
  open,
  onClose,
  layout,
  title,
  onTitleChange,
  analysis,
  config,
}: {
  open: boolean;
  onClose: () => void;
  layout: Layout;
  title: string;
  onTitleChange: (t: string) => void;
  analysis: Analysis;
  config: PublishConfig;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const [author, setAuthor] = useState("");
  const [notes, setNotes] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: Field; details?: string[] } | null>(null);
  const [published, setPublished] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      setPublished(null);
      setCopied(false);
      setToken(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const titleCheck = checkTitle(title);
  const authorCheck = checkFreeText(author, "Your name", AUTHOR_MAX);
  const notesCheck = checkFreeText(notes, "Notes", NOTES_MAX);
  const layoutBlocked = !analysis.canPublish;
  const formOk = titleCheck.ok && authorCheck.ok && notesCheck.ok && !layoutBlocked;

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk || !token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, author, notes, layout, captchaToken: token }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}.` }));
      if (data.ok) {
        setPublished({ id: data.id, url: data.url });
      } else {
        setError({ message: data.error ?? "Publishing failed.", field: data.field, details: data.details });
        captcha.current?.reset();
      }
    } catch {
      setError({ message: "The server couldn't be reached. Check your connection and try again." });
      captcha.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!published) return;
    const url = `${window.location.origin}${published.url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <dialog ref={dialog} className="publish" onClose={onClose} aria-labelledby="publish-heading">
      {published ? (
        <div className="publish-done">
          <h2 id="publish-heading">Published</h2>
          <p>
            <strong>{title}</strong> is in the gallery. Anyone with the link can open it, print the card, or remix it.
          </p>
          {config.storage === "memory" && (
            <p className="notice">This site has no database connected yet, so the scenario disappears when the server restarts.</p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={copyLink}>
              {copied ? "Link copied" : "Copy link"}
            </button>
            <Link className="btn btn--primary" href={published.url}>
              Open scenario page
            </Link>
          </div>
          <button type="button" className="btn btn--quiet dialog-close" onClick={onClose}>
            Keep editing
          </button>
        </div>
      ) : (
        <form onSubmit={publish} noValidate>
          <h2 id="publish-heading">Publish to the gallery</h2>

          {layoutBlocked && (
            <div className="notice notice--error" role="alert">
              <p>Fix these first:</p>
              <ul>
                {analysis.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="field">
            <span>Scenario name</span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={TITLE_MAX + 10}
              aria-invalid={!titleCheck.ok || error?.field === "title"}
              aria-describedby="title-msg"
              autoComplete="off"
              required
            />
            <small id="title-msg" className={titleCheck.ok ? "field-hint" : "field-error"}>
              {titleCheck.ok ? `${title.trim().length}/${TITLE_MAX}` : titleCheck.message}
            </small>
          </label>

          <label className="field">
            <span>Your name (optional)</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={AUTHOR_MAX + 10}
              aria-invalid={!authorCheck.ok}
              autoComplete="nickname"
            />
            {!authorCheck.ok && <small className="field-error">{authorCheck.message}</small>}
          </label>

          <label className="field">
            <span>Notes for players (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={NOTES_MAX + 20}
              placeholder="Suggested pirates, house rules, or how hard it played."
              aria-invalid={!notesCheck.ok}
            />
            <small className={notesCheck.ok ? "field-hint" : "field-error"}>
              {notesCheck.ok ? `${notes.trim().length}/${NOTES_MAX}` : notesCheck.message}
            </small>
          </label>

          {config.captchaMode === "test" && (
            <p className="notice">
              The captcha runs on Cloudflare&apos;s test keys, so it lets everyone through. Add real Turnstile keys before sharing this site.
            </p>
          )}
          {config.storage === "memory" && (
            <p className="notice">No database is connected yet: published scenarios are kept in memory until the server restarts.</p>
          )}

          {open && formOk && <Turnstile ref={captcha} siteKey={config.siteKey} onToken={setToken} />}

          {error && (
            <div className="notice notice--error" role="alert">
              <p>{error.message}</p>
              {error.details && (
                <ul>
                  {error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!formOk || !token || busy}>
              {busy ? "Publishing…" : "Publish scenario"}
            </button>
          </div>
          {formOk && !token && <p className="field-hint dialog-hint">Complete the captcha to publish.</p>}
        </form>
      )}
    </dialog>
  );
}
