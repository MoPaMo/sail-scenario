import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty empty--page">
      <h1>Nothing on this space</h1>
      <p>That page or scenario isn&apos;t here. It may have been removed, or the link is incomplete.</p>
      <p className="empty-actions">
        <Link className="btn btn--primary" href="/">
          Open the editor
        </Link>
        <Link className="btn" href="/gallery">
          Browse the gallery
        </Link>
      </p>
    </div>
  );
}
