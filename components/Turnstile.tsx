"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

/** Cloudflare Turnstile widget, rendered explicitly so it can be reset after a failed publish. */
export default function Turnstile({
  siteKey,
  onToken,
  ref,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    tokenCb.current = onToken;
  }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      tokenCb.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: "light",
          action: "publish-scenario",
          callback: (token: string) => tokenCb.current(token),
          "expired-callback": () => tokenCb.current(null),
          "error-callback": () => {
            tokenCb.current(null);
            return false; // let Turnstile retry on its own
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  return (
    <div className="captcha">
      <div ref={box} />
      {failed && (
        <p className="field-error" role="alert">
          The captcha couldn&apos;t load. Check your connection or content blocker, then close and reopen this dialog.
        </p>
      )}
    </div>
  );
}
