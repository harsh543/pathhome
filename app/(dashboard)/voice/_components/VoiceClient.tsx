"use client";

// Browser-side intake session client.
// In live mode: opens a WebSocket to AssemblyAI, streams mic audio, displays
// incoming transcript turns with PII redacted before any persistence.
// In mock mode (no ASSEMBLYAI_API_KEY): replays a scripted demo conversation.
// Transcript text is treated as DATA — never interpolated into code or SQL.

import { useCallback, useRef, useState } from "react";
import { redactPii } from "@/lib/voice/redact";

// Kept inline to avoid bundling the server-only assemblyai adapter into client JS.
// TODO(verify-docs): confirm terminate_session is the correct field to close an
// AssemblyAI Streaming session gracefully.
const TERMINATE_SESSION_MSG = JSON.stringify({ terminate_session: true });

type Speaker = "caller" | "agent" | "system";

interface Turn {
  index: number;
  speaker: Speaker;
  text: string;
  partial?: boolean;
}

type CallState = "idle" | "connecting" | "active" | "ended" | "enriching" | "enriched" | "error";

// Scripted demo transcript replayed when ASSEMBLYAI_API_KEY is absent.
const MOCK_SCRIPT: Turn[] = [
  { index: 0, speaker: "agent", text: "You've reached PathHome intake. Can I get your first name?" },
  { index: 1, speaker: "caller", text: "It's [NAME]. I was released today." },
  { index: 2, speaker: "agent", text: "Thanks [NAME]. Do you have somewhere to stay tonight?" },
  { index: 3, speaker: "caller", text: "No, I need a bed tonight. And I have court tomorrow morning." },
  { index: 4, speaker: "agent", text: "Understood. Do you need a ride to court?" },
  { index: 5, speaker: "caller", text: "Yes, I don't have transportation. I'm also looking for work." },
  {
    index: 6,
    speaker: "agent",
    text: "Got it. I'm noting shelter, transport, and job support for a caseworker to follow up.",
  },
];

interface SessionData {
  mode: "live" | "mock";
  sessionId: string;
  wsUrl?: string;
}

export default function VoiceClient() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // turnIndex tracks the next index for final transcripts in live mode
  const turnIndexRef = useRef(0);

  const upsertTurn = useCallback((turn: Turn) => {
    setTurns((prev) => {
      const i = prev.findIndex((t) => t.index === turn.index);
      if (i >= 0) {
        const next = [...prev];
        next[i] = turn;
        return next;
      }
      return [...prev, turn];
    });
  }, []);

  const cleanup = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(TERMINATE_SESSION_MSG);
    }
    wsRef.current = null;
  }, []);

  const startMic = useCallback(
    (ws: WebSocket) => {
      navigator.mediaDevices
        .getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
        .then((stream) => {
          streamRef.current = stream;

          // TODO(verify-docs): replace deprecated ScriptProcessorNode with
          // AudioWorkletNode before production deployment
          const ctx = new AudioContext({ sampleRate: 16000 });
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (evt) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(float32ToInt16(evt.inputBuffer.getChannelData(0)).buffer);
          };

          source.connect(processor);
          processor.connect(ctx.destination);
        })
        .catch(() => {
          setErrorMsg("Microphone access denied — allow mic permission and retry");
          setCallState("error");
          ws.close();
        });
    },
    [],
  );

  const startCall = useCallback(async () => {
    setCallState("connecting");
    setTurns([]);
    setErrorMsg(null);
    turnIndexRef.current = 0;

    let session: SessionData;
    try {
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "browser" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(`Session API ${res.status}: ${JSON.stringify(body)}`);
      }
      session = (await res.json()) as SessionData;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start session");
      setCallState("error");
      return;
    }

    setSessionId(session.sessionId);

    if (session.mode === "mock") {
      setCallState("active");
      let idx = 0;
      const accum: Turn[] = [];
      mockTimerRef.current = setInterval(() => {
        const turn = MOCK_SCRIPT[idx];
        if (!turn) {
          clearInterval(mockTimerRef.current!);
          mockTimerRef.current = null;
          void triggerEnrich(session.sessionId, accum);
          return;
        }
        upsertTurn(turn);
        accum.push(turn);
        idx++;
      }, 1800);
      return;
    }

    // Live mode — connect WebSocket to AssemblyAI
    if (!session.wsUrl) {
      setErrorMsg("Session response missing wsUrl");
      setCallState("error");
      return;
    }

    const ws = new WebSocket(session.wsUrl);
    wsRef.current = ws;

    ws.addEventListener("message", (evt) => {
      if (typeof evt.data !== "string") return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(evt.data) as Record<string, unknown>;
      } catch {
        return;
      }

      // TODO(verify-docs): confirm message_type enum values match AssemblyAI Streaming spec
      const mt = msg["message_type"] as string | undefined;

      if (mt === "SessionBegins") {
        setCallState("active");
        startMic(ws);
      } else if (mt === "PartialTranscript") {
        const text = ((msg["text"] as string | undefined) ?? "").trim();
        if (text) {
          upsertTurn({
            index: turnIndexRef.current,
            speaker: "caller",
            text: redactPii(text),
            partial: true,
          });
        }
      } else if (mt === "FinalTranscript") {
        const text = ((msg["text"] as string | undefined) ?? "").trim();
        if (text) {
          upsertTurn({ index: turnIndexRef.current, speaker: "caller", text: redactPii(text) });
          turnIndexRef.current++;
        }
      } else if (mt === "SessionTerminated") {
        cleanup();
        setCallState("ended");
      }
    });

    ws.addEventListener("error", () => {
      setErrorMsg("WebSocket error — check ASSEMBLYAI_API_KEY and network");
      setCallState("error");
      cleanup();
    });

    ws.addEventListener("close", () => {
      setCallState((prev) =>
        prev === "active" || prev === "connecting" ? "ended" : prev,
      );
    });
  }, [upsertTurn, cleanup, startMic]);

  const triggerEnrich = useCallback(
    async (sid: string, completedTurns: Turn[]) => {
      setCallState("enriching");
      try {
        const res = await fetch(`/api/enrich/${sid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turns: completedTurns
              .filter((t) => !t.partial)
              .map(({ index, speaker, text }) => ({ index, speaker, text })),
          }),
        });
        if (res.ok) {
          setCallState("enriched");
        } else {
          setCallState("ended");
        }
      } catch {
        setCallState("ended");
      }
    },
    [],
  );

  const endCall = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  const reset = useCallback(() => {
    setCallState("idle");
    setTurns([]);
    setSessionId(null);
    setErrorMsg(null);
    turnIndexRef.current = 0;
  }, []);

  return (
    <div className="voice-client">
      <div className="call-controls">
        {callState === "idle" && (
          <button className="btn-primary" onClick={() => void startCall()}>
            Start Call
          </button>
        )}
        {(callState === "connecting" || callState === "active") && (
          <>
            <span className={`call-status call-status-${callState}`}>
              {callState === "connecting" ? "Connecting…" : "● Live"}
            </span>
            <button className="btn-danger" onClick={endCall}>
              End Call
            </button>
          </>
        )}
        {callState === "enriching" && (
          <span className="call-status-connecting">Enriching transcript…</span>
        )}
        {callState === "enriched" && (
          <>
            <span style={{ color: "var(--resolved)", fontWeight: 600, fontSize: 13 }}>
              ✓ Enrichment queued
            </span>
            <button className="btn-secondary" onClick={reset}>New Call</button>
          </>
        )}
        {(callState === "ended" || callState === "error") && (
          <>
            <span className="call-status-ended">
              {callState === "ended" ? "Call ended" : "Error"}
            </span>
            <button className="btn-secondary" onClick={reset}>
              New Call
            </button>
          </>
        )}
      </div>

      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {sessionId && (
        <div className="session-meta">
          <span>Session</span>
          <code>{sessionId}</code>
        </div>
      )}

      {turns.length > 0 ? (
        <div className="transcript live-transcript">
          {turns.map((t) => (
            <div
              key={t.index}
              className={`turn speaker-${t.speaker}${t.partial ? " partial" : ""}`}
            >
              <span className="who">{t.speaker}</span>
              {t.text}
            </div>
          ))}
        </div>
      ) : callState === "idle" ? (
        <div className="empty">
          Press <strong>Start Call</strong> to begin a browser intake session.
          <br />
          <span style={{ fontSize: "12px" }}>
            No <code>ASSEMBLYAI_API_KEY</code>? The scripted demo runs automatically.
          </span>
        </div>
      ) : callState === "active" ? (
        <div className="empty">Waiting for speech…</div>
      ) : null}

      <div className="assist-note">
        This session is transcribed and reviewed by a human caseworker. No housing, legal, or
        benefits decisions are auto-committed. PII is redacted before storage.
      </div>
    </div>
  );
}

function float32ToInt16(f32: Float32Array): Int16Array {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]!));
    i16[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return i16;
}
