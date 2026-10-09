import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditGate from "@/components/EditGate";
import { emailEnabled } from "@/lib/email";
import { getStore, ID_RE, toPublic } from "@/lib/store";
import { captchaMode, publicSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit scenario",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  const rec = await getStore().get(id);
  if (!rec) notFound();
  return (
    <EditGate
      scenario={toPublic(rec)}
      config={{ siteKey: publicSiteKey(), captchaMode: captchaMode(), storage: getStore().kind, emailEnabled: emailEnabled() }}
    />
  );
}
