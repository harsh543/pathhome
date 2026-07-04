// Structured JSON logger. Every log line is a single JSON object on stdout
// so log aggregators (Datadog, CloudWatch, Vercel Log Drains) can parse it.
// All fields are plain values — no circular refs, no Date objects.
//
// Usage:
//   import { log } from "@/lib/obs/logger";
//   log.info("voice_session_created", { sessionId, mode });
//   log.warn("consent_missing", { caseId, actor });
//   log.error("db_write_failed", { error: serializeError(err) });

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
} as const;
