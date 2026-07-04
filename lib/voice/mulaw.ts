// µ-law (G.711) → 16-bit linear PCM decoder.
// Twilio Media Streams sends 8kHz mono µ-law; AssemblyAI expects 16kHz PCM.
// Decode first, then upsample 8→16 kHz with simple linear interpolation.

// Precomputed µ-law decode table (256 entries)
const MULAW_TABLE: Int16Array = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let b = ~i & 0xff;
    const sign = b & 0x80 ? -1 : 1;
    const exp = (b >> 4) & 0x07;
    const mantissa = b & 0x0f;
    const magnitude = ((mantissa << 1) + 33) << (exp + 2);
    table[i] = sign * (magnitude - 33);
  }
  return table;
})();

/** Decode a base64 µ-law chunk (from Twilio) to Int16 PCM at 8 kHz. */
export function decodeMulaw(base64Chunk: string): Int16Array {
  const bytes = Uint8Array.from(atob(base64Chunk), (c) => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    pcm[i] = MULAW_TABLE[bytes[i]!]!;
  }
  return pcm;
}

/** Linear upsample Int16 PCM from 8 kHz to 16 kHz (2× interpolation). */
export function upsample8to16(pcm8: Int16Array): Int16Array {
  const out = new Int16Array(pcm8.length * 2);
  for (let i = 0; i < pcm8.length; i++) {
    out[i * 2] = pcm8[i]!;
    const next = pcm8[i + 1] ?? pcm8[i]!;
    out[i * 2 + 1] = Math.round((pcm8[i]! + next) / 2);
  }
  return out;
}
