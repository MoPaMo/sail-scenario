import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";

export const metadata: Metadata = {
  title: { default: "Sail Scenario Workshop", template: "%s – Sail Scenario Workshop" },
  description: "Design, check and share custom scenarios for Sail, the cooperative trick-taking game for two.",
};

export const viewport: Viewport = {
  themeColor: "#0d3135",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="masthead">
          <Link href="/" className="brand" aria-label="Sail Scenario Workshop, editor">
            <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
              <polygon points="13,1.5 26,10.5 38.5,20 26,29.5 13,38.5 1.5,29.5 13,20 1.5,10.5" />
            </svg>
            <span className="brand-name">Sail</span>
            <span className="brand-sub">Scenario Workshop</span>
          </Link>
          <NavLinks />
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <p>
            Unofficial fan tool. Sail is designed by Akiyama Koryo and Kozu Yusei and published by Allplay. This site isn&apos;t
            affiliated with either.
          </p>
        </footer>
      </body>
    </html>
  );
}
