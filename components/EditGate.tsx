"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicScenario } from "@/lib/store";
import { editKeyStorage } from "./EditDialog";
import Editor from "./Editor";
import type { PublishConfig } from "./PublishDialog";

type State =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; key: string };

/**
 * Opens the editor for a published scenario once the private edit key checks
 * out. The key arrives in the URL fragment (#k=…), which is never sent to the
 * server; it's moved into this tab's session storage and removed from the
 * address bar, so it doesn't linger in history or screenshots.
 */
export default function EditGate({ scenario, config }: { scenario: PublicScenario; config: PublishConfig }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  // Pasting the full link into a tab that already shows this page only changes the
  // fragment, which doesn't reload the page, so re-check when it changes.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onHash = () => {
      if (/k=/.test(window.location.hash)) setAttempt((n) => n + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setState({ kind: "checking" });
    let key: string | null = null;
    const fromLink = /(?:^#|&)k=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash);
    if (fromLink) {
      key = fromLink[1];
      try {
        window.sessionStorage.setItem(editKeyStorage(scenario.id), key);
      } catch {
        /* private mode: the key still works for this visit */
      }
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      try {
        key = window.sessionStorage.getItem(editKeyStorage(scenario.id));
      } catch {
        key = null;
      }
    }
    if (!key) {
      setState({ kind: "missing" });
      return;
    }
    let cancelled = false;
    fetch(`/api/scenarios/${scenario.id}/access`, { method: "POST", headers: { authorization: `Bearer ${key}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}.` }));
        if (cancelled) return;
        if (data.ok) setState({ kind: "ok", key: key! });
        else {
          if (res.status === 403) {
            try {
              window.sessionStorage.removeItem(editKeyStorage(scenario.id));
            } catch {
              /* ignore */
            }
          }
          setState({ kind: "invalid", message: data.error ?? "This edit link isn't valid." });
        }
      })
      .catch(() => !cancelled && setState({ kind: "invalid", message: "The server couldn't be reached. Check your connection and reload." }));
    return () => {
      cancelled = true;
    };
  }, [scenario.id, attempt]);

  if (state.kind === "ok") {
    return (
      <Editor
        config={config}
        edit={{
          id: scenario.id,
          key: state.key,
          title: scenario.title,
          author: scenario.author,
          notes: scenario.notes,
          layout: scenario.layout,
        }}
      />
    );
  }

  return (
    <div className="empty empty--page" aria-live="polite">
      {state.kind === "checking" ? (
        <p>Checking your edit link…</p>
      ) : (
        <>
          <h1>{state.kind === "missing" ? "This page needs your edit link" : "This edit link doesn't work"}</h1>
          <p>
            {state.kind === "missing"
              ? "Open the private link from the email you got when you published this scenario. Without it, the scenario can't be changed."
              : `${state.message} Make sure you opened the whole link from the email.`}
          </p>
          <p className="empty-actions">
            <Link className="btn btn--primary" href={`/s/${scenario.id}`}>
              View the scenario
            </Link>
            <Link className="btn" href="/">
              Design a new one
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
