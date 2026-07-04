export const dynamic = "force-dynamic";

// Full voice-ops panel is built in Block 8. Placeholder keeps the nav link live.
export default function FleetAnalysisPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Fleet Analysis</h1>
          <div className="sub">Voice-ops: prompt-version performance &amp; failure-mode clusters</div>
        </div>
      </div>
      <div className="empty">
        Coming in Block 8 — completion rate, mean turn latency, entity capture rate, and
        failure-mode clustering (address_capture · interruption_loop · over_collection) per prompt
        version.
      </div>
    </>
  );
}
