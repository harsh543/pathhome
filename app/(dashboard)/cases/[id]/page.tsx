import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseDetail } from "@/lib/db/queries";
import type { EnrichmentResultRow, JsonValue, TranscriptRow } from "@/lib/schemas/db";
import { UuidSchema } from "@/lib/schemas/db";
import { Card, StatusBadge, UrgencyBadge, formatDateTime } from "../../_components/ui";

export const dynamic = "force-dynamic";

/** Defensively coerce a jsonb value (blockers/topics) into a string[]. */
function toStringArray(value: JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

interface TimelineEvent {
  at: Date | null;
  text: string;
}

function buildTimeline(detail: Awaited<ReturnType<typeof getCaseDetail>>): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({ at: detail.case.opened_at, text: "Case opened" });
  for (const n of detail.needs) {
    events.push({ at: n.created_at, text: `Need logged — ${n.category} (${n.urgency})` });
  }
  for (const r of detail.referrals) {
    events.push({ at: r.created_at, text: `Referral ${r.status}` });
  }
  for (const f of detail.followUps) {
    events.push({ at: f.created_at, text: `Follow-up created — ${f.description}` });
  }
  for (const e of detail.enrichments) {
    events.push({ at: e.created_at, text: `Call enriched — ${e.completion_status ?? "unknown"}` });
  }
  return events.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

function BlockersCard({ enrichments }: { enrichments: EnrichmentResultRow[] }) {
  const blockers = Array.from(
    new Set(enrichments.flatMap((e) => toStringArray(e.blockers))),
  );
  return (
    <Card title="Unresolved blockers" className="blockers">
      {blockers.length === 0 ? (
        <div className="none">No blockers flagged.</div>
      ) : (
        <ul>
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TranscriptCard({ transcripts }: { transcripts: TranscriptRow[] }) {
  const turns = transcripts.flatMap((t) => t.turns);
  return (
    <Card title="Transcript (redacted)">
      {turns.length === 0 ? (
        <div className="faint">No transcript captured yet.</div>
      ) : (
        <div className="transcript">
          {turns.map((turn, i) => (
            <div className={`turn speaker-${turn.speaker}`} key={`${turn.index}-${i}`}>
              <span className="who">{turn.speaker}</span>
              <span>{turn.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();

  let detail: Awaited<ReturnType<typeof getCaseDetail>>;
  try {
    detail = await getCaseDetail({ caseId: id });
  } catch (error) {
    if (error instanceof Error && error.message.includes("returned none")) notFound();
    throw error;
  }

  const { case: kase, person, needs, referrals, followUps, transcripts, enrichments } = detail;
  const timeline = buildTimeline(detail);
  const latestEnrichment = enrichments[0];
  const personName =
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Unassigned person";

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="back-link" href="/">
            ← Cases
          </Link>
          <h1 style={{ marginTop: 6 }}>{personName}</h1>
          <div className="sub">
            <StatusBadge status={kase.status} /> <UrgencyBadge urgency={kase.priority} /> · opened{" "}
            {formatDateTime(kase.opened_at)}
          </div>
        </div>
      </div>

      <div className="assist-note">
        Assistive summary for a human case manager. No housing, legal, or benefits decision is
        finalized without operator review.
      </div>

      <div className="grid-2">
        {/* Left column: transcript + timeline */}
        <div>
          {latestEnrichment ? (
            <Card title="Call summary">
              <p style={{ marginTop: 0 }}>{latestEnrichment.summary ?? "—"}</p>
              <div className="faint">
                Overall urgency:{" "}
                {latestEnrichment.urgency_overall ? (
                  <UrgencyBadge urgency={latestEnrichment.urgency_overall} />
                ) : (
                  "—"
                )}{" "}
                · completion: {latestEnrichment.completion_status ?? "—"} · human follow-up:{" "}
                {latestEnrichment.requires_human_followup ? "required" : "not flagged"}
              </div>
            </Card>
          ) : null}

          <TranscriptCard transcripts={transcripts} />

          <Card title="Timeline">
            <ul className="timeline">
              {timeline.map((ev, i) => (
                <li key={i}>
                  <div className="t-time">{formatDateTime(ev.at)}</div>
                  <div className="t-text">{ev.text}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right column: blockers, needs, follow-ups, referrals */}
        <div>
          <BlockersCard enrichments={enrichments} />

          <Card title={`Needs (${needs.length})`}>
            {needs.length === 0 ? (
              <div className="faint">No needs recorded.</div>
            ) : (
              <div className="stack">
                {needs.map((n) => (
                  <div className="need-row" key={n.id}>
                    <UrgencyBadge urgency={n.urgency} />
                    <span className="desc">
                      <strong style={{ textTransform: "capitalize" }}>
                        {n.category.replace("_", " ")}
                      </strong>
                      {n.description ? ` — ${n.description}` : ""}
                    </span>
                    <span className="faint">{n.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Follow-ups (${followUps.length})`}>
            {followUps.length === 0 ? (
              <div className="faint">No follow-ups.</div>
            ) : (
              <ul className="checklist">
                {followUps.map((f) => {
                  const done = f.status === "done" || f.status === "completed";
                  return (
                    <li key={f.id}>
                      <input type="checkbox" checked={done} readOnly aria-label={f.description} />
                      <span className={done ? "done" : ""}>{f.description}</span>
                      <span className="faint" style={{ marginLeft: "auto" }}>
                        {f.due_at ? `due ${formatDateTime(f.due_at)}` : f.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={`Referrals (${referrals.length})`}>
            {referrals.length === 0 ? (
              <div className="faint">No referrals.</div>
            ) : (
              <div className="stack">
                {referrals.map((r) => (
                  <div className="referral-row" key={r.id}>
                    <span className="badge status-open">{r.status}</span>
                    <span className="desc">{r.notes ?? "Referral"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
