import VoiceClient from "./_components/VoiceClient";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Browser Intake</h1>
          <div className="sub">
            Live transcription — redacted &amp; short-lived. Human caseworker reviews every session.
          </div>
        </div>
      </div>
      <VoiceClient />
    </>
  );
}
