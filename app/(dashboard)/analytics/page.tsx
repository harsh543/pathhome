import { getCaseList } from "@/lib/db/queries";
import type { CaseStatus, UrgencyLevel } from "@/lib/schemas/db";
import { Card } from "../_components/ui";

export const dynamic = "force-dynamic";

const STATUSES: CaseStatus[] = ["open", "in_progress", "resolved", "escalated"];
const PRIORITIES: UrgencyLevel[] = ["critical", "high", "medium", "low"];

function BarRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="bar-row">
      <span className="label" style={{ textTransform: "capitalize" }}>
        {label.replace("_", " ")}
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="val">{count}</span>
    </div>
  );
}

export default async function AnalyticsPage() {
  const cases = await getCaseList();
  const total = cases.length;

  const byStatus = STATUSES.map((s) => ({
    key: s,
    count: cases.filter((c) => c.status === s).length,
  }));
  const byPriority = PRIORITIES.map((p) => ({
    key: p,
    count: cases.filter((c) => c.priority === p).length,
  }));

  const openNeeds = cases.reduce((sum, c) => sum + c.latest_needs_count, 0);
  const active = byStatus.find((s) => s.key === "open")!.count +
    byStatus.find((s) => s.key === "in_progress")!.count;
  const escalated = byStatus.find((s) => s.key === "escalated")!.count;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Caseload overview</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{total}</div>
          <div className="l">Total cases</div>
        </div>
        <div className="stat">
          <div className="n">{active}</div>
          <div className="l">Active</div>
        </div>
        <div className="stat">
          <div className="n">{openNeeds}</div>
          <div className="l">Open needs</div>
        </div>
        <div className="stat">
          <div className="n">{escalated}</div>
          <div className="l">Escalated</div>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Cases by status">
          {byStatus.map((s) => (
            <BarRow key={s.key} label={s.key} count={s.count} total={total} />
          ))}
        </Card>
        <Card title="Cases by priority">
          {byPriority.map((p) => (
            <BarRow key={p.key} label={p.key} count={p.count} total={total} />
          ))}
        </Card>
      </div>

      <div className="assist-note">
        Per-prompt-version voice-ops metrics (completion rate, latency, capture rate, failure-mode
        clusters) live on the Fleet Analysis page.
      </div>
    </>
  );
}
