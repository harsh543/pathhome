// Twilio Media Streams → AssemblyAI forwarding logic.
// Consumed by a WebSocket server (custom server or sidecar) — NOT imported
// by any Next.js Route Handler, which cannot upgrade to WebSocket.
//
// Protocol:
//   Twilio sends JSON messages over WS:
//     { event: "connected" }
//     { event: "start",   streamSid, start: { callSid, ... } }
//     { event: "media",   streamSid, media: { payload: base64MulawChunk } }
//     { event: "stop" }
//
// This module converts each "media" frame (µ-law 8 kHz) to PCM 16 kHz and
// forwards the binary buffer to the open AssemblyAI Streaming WebSocket.
//
// Usage (inside a ws:// server message handler):
//   const bridge = new TwilioBridge(assemblyAiWs);
//   twiliSocket.on("message", (data) => bridge.handle(data.toString()));

import { decodeMulaw, upsample8to16 } from "./mulaw";
import { TERMINATE_SESSION_MSG } from "./assemblyai";

interface TwilioMessage {
  event: "connected" | "start" | "media" | "stop";
  streamSid?: string;
  media?: { payload: string };
}

export class TwilioBridge {
  private readonly aaiWs: { readyState: number; send(data: ArrayBuffer): void; close(): void };

  constructor(
    assemblyAiWs: { readyState: number; send(data: ArrayBuffer): void; close(): void },
  ) {
    this.aaiWs = assemblyAiWs;
  }

  handle(rawMessage: string): void {
    let msg: TwilioMessage;
    try {
      msg = JSON.parse(rawMessage) as TwilioMessage;
    } catch {
      return;
    }

    if (msg.event === "media" && msg.media?.payload) {
      if (this.aaiWs.readyState !== 1 /* OPEN */) return;
      const pcm8 = decodeMulaw(msg.media.payload);
      const pcm16 = upsample8to16(pcm8);
      this.aaiWs.send(pcm16.buffer as ArrayBuffer);
    } else if (msg.event === "stop") {
      if (this.aaiWs.readyState === 1) {
        // TERMINATE_SESSION_MSG is a plain JSON string; AssemblyAI expects text frame
        (this.aaiWs as unknown as { send(data: string): void }).send(TERMINATE_SESSION_MSG);
      }
    }
  }
}
