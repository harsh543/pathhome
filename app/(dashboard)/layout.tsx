import type { ReactNode } from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Path<span>Home</span>
        </div>
        <div className="tagline">Reentry &amp; housing coordination</div>
        <nav>
          <Link href="/">Cases</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/fleet-analysis">Fleet Analysis</Link>
          <Link href="/voice">Browser Intake</Link>
        </nav>
        <div className="trust">
          Assistive, not autonomous. A human owns every housing, legal, and benefits decision.
          Transcripts are PII-redacted and short-lived.
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
