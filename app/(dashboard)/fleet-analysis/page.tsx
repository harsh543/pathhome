import { getFleetMetrics } from "@/lib/db/queries";
import type { FleetMetricsRow } from "@/lib/schemas/db";
import { Card } from "../_components/ui";

export const dynamic = "force-dynamic";

const FAILURE_LABELS: Record<string, string> = {
  address_capture: "Address capture",
  interruption_loop: "Interruption loop",
  over_collection: "Over-collection",
  none: "None",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function ms(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n)} ms`;
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const fill = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="bar-row">
      <span className="label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${fill}%` }} />
      </span>
      <span className="val">{value}</span>
    </div>
  );
}

function FailureTable({ modes }: { modes: Record<string, number> }) {
  const entries = Object.entries(modes).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    return <span className="muted">No failures recorded</span>;
  }
  return (
    <table className="data" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>Mode</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([mode, count]) => (
          <tr key={mode}>
            <td>{FAILURE_LABELS[mode] ?? mode}</td>
            <td>{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VersionCard({ row }: { row: FleetMetricsRow }) {
  const completionPct = Math.round(row.completion_rate * 100);
  const capturePct =
    row.entity_capture_rate !== null ? Math.round(row.entity_capture_rate * 100) : null;

  return (
    <Card title={`${row.prompt_name} — ${row.prompt_version}`}>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="n">{row.total_calls}</div>
          <div className="l">Calls</div>
        </div>
        <div className="stat">
          <div className="n">{pct(row.completion_rate)}</div>
          <div className="l">Completion</div>
        </div>
        <div className="stat">
          <div className="n">{capturePct !== null ? pct(capturePct / 100) : "—"}</div>
          <div className="l">Capture rate</div>
        </div>
        <div className="stat">
          <div className="n">{ms(row.mean_turn_latency_ms)}</div>
          <div className="l">Avg latency</div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Completion rate
          </div>
          <div className="bar-row">
            <span className="bar-track" style={{ flex: 1 }}>
              <span
                className="bar-fill"
                style={{
                  width: `${completionPct}%`,
                  background: completionPct >= 80
                    ? "var(--resolved)"
                    : completionPct >= 50
                      ? "var(--high)"
                      : "var(--escalated)",
                }}
              />
            </span>
            <span className="val">{pct(row.completion_rate)}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Failure modes
          </div>
          <FailureTable modes={row.failure_modes} />
        </div>
      </div>
    </Card>
  );
}

export default async function FleetAnalysisPage() {
  const rows = await getFleetMetrics();

  const totalCalls = rows.reduce((s, r) => s + r.total_calls, 0);
  const avgCompletion =
    rows.length === 0
      ? 0
      : rows.reduce((s, r) => s + r.completion_rate * r.total_calls, 0) /
        Math.max(1, totalCalls);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Fleet Analysis</h1>
          <div className="sub">Voice-ops: completion rate, latency, entity capture, failure-mode clusters</div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="n">{rows.length}</div>
          <div className="l">Prompt versions</div>
        </div>
        <div className="stat">
          <div className="n">{totalCalls}</div>
          <div className="l">Total calls</div>
        </div>
        <div className="stat">
          <div className="n">{pct(avgCompletion)}</div>
          <div className="l">Fleet completion</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          No call metrics yet. Complete a voice session and trigger enrichment to populate this page.
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 12px" }}>
            Per-version breakdown
          </h2>

          {rows.map((row) => (
            <VersionCard key={row.prompt_version_id} row={row} />
          ))}

          {totalCalls > 0 && (
            <Card title="Call volume by prompt version">
              {rows.map((row) => (
                <BarRow
                  key={row.prompt_version_id}
                  label={`${row.prompt_name} ${row.prompt_version}`}
                  value={row.total_calls}
                  max={Math.max(...rows.map((r) => r.total_calls))}
                />
              ))}
            </Card>
          )}
        </>
      )}

      <div className="assist-note">
        Metrics are aggregated by prompt version. Add a second prompt version via seed or the
        prompt_versions table to compare performance across variants.
      </div>
    </>
  );
}
