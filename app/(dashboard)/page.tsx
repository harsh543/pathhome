import Link from "next/link";
import { getCaseList } from "@/lib/db/queries";
import { StatusBadge, UrgencyBadge, formatDate } from "./_components/ui";

// Operator dashboard reads live case data — never cache.
export const dynamic = "force-dynamic";

export default async function CaseListPage() {
  const cases = await getCaseList();

  const activeCount = cases.filter(
    (c) => c.status === "open" || c.status === "in_progress",
  ).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cases</h1>
          <div className="sub">
            {cases.length} total · {activeCount} active
          </div>
        </div>
      </div>

      <section className="card">
        {cases.length === 0 ? (
          <div className="empty">No cases yet. Run a voice intake or `pnpm seed`.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Open needs</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="row-link" href={`/cases/${c.id}`}>
                      {c.person_summary}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <UrgencyBadge urgency={c.priority} />
                  </td>
                  <td>{c.latest_needs_count}</td>
                  <td className="faint">{formatDate(c.opened_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
