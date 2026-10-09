import Editor from "@/components/Editor";
import { emailEnabled } from "@/lib/email";
import { getStore } from "@/lib/store";
import { captchaMode, publicSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export default function EditorPage() {
  return (
    <Editor
      config={{ siteKey: publicSiteKey(), captchaMode: captchaMode(), storage: getStore().kind, emailEnabled: emailEnabled() }}
    />
  );
}
