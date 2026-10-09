"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks() {
  const path = usePathname();
  const galleryActive = path.startsWith("/gallery") || path.startsWith("/s/");
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" aria-current={path === "/" ? "page" : undefined}>
        Editor
      </Link>
      <Link href="/gallery" aria-current={galleryActive ? "page" : undefined}>
        Gallery
      </Link>
    </nav>
  );
}
