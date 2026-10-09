"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/analysis";
import { checkFreeText, checkTitle, TITLE_MAX } from "@/lib/profanity";
import type { Layout } from "@/lib/scenario";
import type { EditSession } from "./Editor";

const AUTHOR_MAX = 40;
const NOTES_MAX = 400;

export const editKeyStorage = (id: string) => `sail-workshop:edit:${id}`;

/** Save or delete a published scenario, authorised by the private edit key. */
export default function EditDialog({
  open,
  onClose,
  layout,
  title,
  onTitleChange,
  analysis,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  layout: Layout;
  title: string;
  onTitleChange: (t: string) => void;
  analysis: Analysis;
  edit: EditSession;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [author, setAuthor] = useState(edit.author);
  const [notes, setNotes] = useState(edit.notes);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string[] } | null>(null);
  const [done, setDone] = useState<"saved" | "deleted" | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      setConfirmDelete(false);
      if (done === "saved") setDone(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, done]);

  const titleCheck = checkTitle(title);
  const authorCheck = checkFreeText(author, "Your name", AUTHOR_MAX);
  const notesCheck = checkFreeText(notes, "Notes", NOTES_MAX);
  const formOk = titleCheck.ok && authorCheck.ok && notesCheck.ok && analysis.canPublish;

  async function send(method: "PATCH" | "DELETE") {
    setBusy(method === "PATCH" ? "save" : "delete");
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${edit.id}`, {
        method,
        headers: { authorization: `Bearer ${edit.key}`, "content-type": "application/json" },
        body: method === "PATCH" ? JSON.stringify({ title, author, notes, layout }) : undefined,
      });
      const data = await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}.` }));
      if (!data.ok) {
        setError({ message: data.error ?? "That didn't work.", details: data.details });
        return;
      }
      if (method === "DELETE") {
        try {
          window.sessionStorage.removeItem(editKeyStorage(edit.id));
        } catch {
          /* ignore */
        }
        setDone("deleted");
      } else {
        setDone("saved");
      }
    } catch {
      setError({ message: "The server couldn't be reached. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="publish"
      onClose={onClose}
      onCancel={(e) => done === "deleted" && e.preventDefault()}
      aria-labelledby="edit-heading"
    >
      {done === "deleted" ? (
        <div className="publish-done">
          <h2 id="edit-heading">Deleted</h2>
          <p>
            <strong>{title}</strong> is gone from the gallery, and its page and edit link no longer work.
          </p>
          <div className="dialog-actions">
            <Link className="btn" href="/gallery">
              Go to the gallery
            </Link>
            <Link className="btn btn--primary" href="/">
              Design a new scenario
            </Link>
          </div>
        </div>
      ) : done === "saved" ? (
        <div className="publish-done">
          <h2 id="edit-heading">Saved</h2>
          <p>Your changes are live on the scenario page.</p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              Keep editing
            </button>
            <Link className="btn btn--primary" href={`/s/${edit.id}`}>
              Open scenario page
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formOk && !busy) send("PATCH");
          }}
          noValidate
        >
          <h2 id="edit-heading">Save changes</h2>

          {!analysis.canPublish && (
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
              aria-invalid={!titleCheck.ok}
              autoComplete="off"
            />
            <small className={titleCheck.ok ? "field-hint" : "field-error"}>
              {titleCheck.ok ? `${title.trim().length}/${TITLE_MAX}` : titleCheck.message}
            </small>
          </label>

          <label className="field">
            <span>Your name (optional)</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={AUTHOR_MAX + 10} aria-invalid={!authorCheck.ok} />
            {!authorCheck.ok && <small className="field-error">{authorCheck.message}</small>}
          </label>

          <label className="field">
            <span>Notes for players (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={NOTES_MAX + 20} aria-invalid={!notesCheck.ok} />
            <small className={notesCheck.ok ? "field-hint" : "field-error"}>
              {notesCheck.ok ? `${notes.trim().length}/${NOTES_MAX}` : notesCheck.message}
            </small>
          </label>

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
            <button type="submit" className="btn btn--primary" disabled={!formOk || busy !== null}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
          </div>

          <div className="danger-zone">
            {confirmDelete ? (
              <>
                <p>Delete this scenario for everyone? This can&apos;t be undone.</p>
                <div className="dialog-actions dialog-actions--start">
                  <button type="button" className="btn btn--danger" onClick={() => send("DELETE")} disabled={busy !== null}>
                    {busy === "delete" ? "Deleting…" : "Delete for good"}
                  </button>
                  <button type="button" className="btn btn--quiet" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn--quiet btn--danger-text" onClick={() => setConfirmDelete(true)}>
                Delete scenario…
              </button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
