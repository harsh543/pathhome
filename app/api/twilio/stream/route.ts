// Twilio Media Streams bridge — optional, behind TWILIO_ENABLED=false.
//
// When enabled, this endpoint handles two roles:
//
//   POST — called by Twilio when a call arrives on the configured number.
//          Returns TwiML that instructs Twilio to open a Media Stream to
//          this server and send audio over WebSocket.
//
//   WebSocket — Twilio connects here and sends base64 µ-law audio frames.
//               The bridge decodes them (µ-law→PCM, 8→16 kHz) and forwards
//               them to an AssemblyAI Streaming session opened server-side.
//
// WebSocket limitation in Next.js App Router:
//   Route Handlers do not support raw WebSocket upgrades. For the Twilio WS
//   leg, run a standalone ws:// server (e.g. in instrumentation.ts) or deploy
//   a small bridge sidecar. The TwiML POST handler is wired below; the WS
//   bridge logic is in lib/voice/twilio-bridge.ts (TODO: wire in custom
//   server once WS support is confirmed for this deployment target).
//   TODO(verify-docs): confirm WebSocket upgrade path for Vercel Functions.

import { NextResponse } from "next/server";
import { serializeError } from "@/lib/db/errors";

export const dynamic = "force-dynamic";

const ENABLED = process.env.TWILIO_ENABLED === "true";

/** Returns TwiML that connects the call to the Media Stream endpoint. */
function twiml(wsUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
  <Pause length="60" />
</Response>`.trim();
}

// ── POST — inbound call webhook ───────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  if (!ENABLED) {
    return NextResponse.json(
      { error: "Twilio integration is disabled (TWILIO_ENABLED=false)" },
      { status: 501 },
    );
  }

  try {
    // Derive the WebSocket URL from the current request host.
    // In production, override with TWILIO_STREAM_WS_URL if behind a proxy.
    const host = req.headers.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "ws" : "wss";
    const streamWsUrl =
      process.env.TWILIO_STREAM_WS_URL ??
      `${protocol}://${host}/api/twilio/stream/ws`;

    const xml = twiml(streamWsUrl);

    console.log(
      JSON.stringify({
        level: "info",
        event: "twilio_inbound_call",
        streamWsUrl,
      }),
    );

    return new NextResponse(xml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", event: "twilio_twiml_error", error: serializeError(err) }),
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET — liveness probe ──────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ enabled: ENABLED, path: "/api/twilio/stream" });
}
