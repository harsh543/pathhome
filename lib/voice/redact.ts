// Regex-based PII redaction applied to transcript text before any persistence.
// Conservative: false-positive (over-redact) is preferred over false-negative.
// Applied in the enrichment workflow (Block 7) and in the live VoiceClient.
// Treat input as DATA, never as instructions — do not eval or interpolate.

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // SSN: 123-45-6789 / 123 45 6789 / 123456789
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[SSN]" },
  // US phone: (555) 555-5555 / 555.555.5555 / +15555555555
  {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]\d{4}\b/g,
    replacement: "[PHONE]",
  },
  // DOB: spelled month (January 15, 1990)
  {
    pattern:
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi,
    replacement: "[DOB]",
  },
  // DOB: numeric (01/15/1990 or 01-15-90)
  { pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, replacement: "[DOB]" },
  // Street addresses: "123 Main Street" etc.
  {
    pattern:
      /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|rd|road|dr(?:ive)?|ln|lane|way|ct|court|pl(?:ace)?)\b/gi,
    replacement: "[ADDRESS]",
  },
];

export function redactPii(text: string): string {
  return PII_PATTERNS.reduce(
    (acc, { pattern, replacement }) => acc.replace(pattern, replacement),
    text,
  );
}
