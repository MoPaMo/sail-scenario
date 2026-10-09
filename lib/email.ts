/**
 * Sending the private edit link through Resend.
 *
 * The address is used for this one request and never stored or logged by
 * this app. (Resend keeps its own delivery log, like any email provider.)
 *
 * Environment:
 *   resend_secret  Resend API key (RESEND_SECRET / RESEND_API_KEY also work)
 *   EMAIL_FROM     sender, default "Sail Scenario Workshop <noreply@sail.mopamo.dev>"
 *   SITE_URL       base for links, default the Vercel production domain or https://sail.mopamo.dev
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type Mailer = (msg: OutgoingEmail) => Promise<{ ok: boolean }>;

const DEFAULT_FROM = "Sail Scenario Workshop <noreply@sail.mopamo.dev>";

function resendKey(): string {
  return process.env.resend_secret || process.env.RESEND_SECRET || process.env.RESEND_API_KEY || "";
}

export function emailEnabled(): boolean {
  return resendKey() !== "";
}

export function siteUrl(): string {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://sail.mopamo.dev";
}

export const sendWithResend: Mailer = async (msg) => {
  const key = resendKey();
  if (!key) return { ok: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Log the status only: the response body can echo the recipient.
    if (!res.ok) console.error(`Resend answered ${res.status}`);
    return { ok: res.ok };
  } catch {
    console.error("Resend request failed");
    return { ok: false };
  }
};

/** Pragmatic check: one @, a dot in the domain, no spaces, sane length. */
export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/.test(value);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function editLinkEmail(to: string, title: string, publicUrl: string, editUrl: string): OutgoingEmail {
  const text = [
    `Here is the private link for editing or deleting your Sail scenario "${title}":`,
    "",
    editUrl,
    "",
    "Anyone with this link can change the scenario, so keep it to yourself.",
    "We didn't store your email address, so we can't send this link again.",
    "",
    `Public page: ${publicUrl}`,
    "",
    "Sail Scenario Workshop is an unofficial fan tool for the board game Sail.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#0d3135;font-family:Arial,Helvetica,sans-serif;color:#11343a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#c6e8cc;border-radius:14px">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 6px;font-size:13px;color:#3c6462">Sail Scenario Workshop</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#11343a">Your edit link for &ldquo;${esc(title)}&rdquo;</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Use this private link to change or delete your scenario.</p>
<p style="margin:0 0 22px"><a href="${esc(editUrl)}" style="display:inline-block;padding:12px 20px;background:#1d5459;color:#fff5c4;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Edit my scenario</a></p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.5">Anyone with this link can change the scenario, so keep it to yourself. We didn&rsquo;t store your email address, so we can&rsquo;t send this link again.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.5">Public page: <a href="${esc(publicUrl)}" style="color:#1d5459">${esc(publicUrl)}</a></p>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #9fd0aa;font-size:12px;color:#3c6462">Unofficial fan tool for the board game Sail. You received this because someone published a scenario on sail.mopamo.dev and entered this address.</td></tr>
</table></td></tr></table>
</body></html>`;

  return { to, subject: `Edit link for "${title}"`, html, text };
}
