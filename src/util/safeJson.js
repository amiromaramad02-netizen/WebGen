/** Tolerant JSON extraction for model output that should already be schema-clean. */
export function safeJsonParse(input) {
  if (input === null || input === undefined) return { ok: false, value: null, error: 'empty response' };
  if (typeof input === 'object') return { ok: true, value: input };

  const text = String(input).trim();
  const candidates = [text];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      /* try next */
    }
  }
  return { ok: false, value: null, error: 'response was not valid JSON' };
}

/** Narrow a parsed value to a plain object (never an array). */
export function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

/** Narrow a parsed value to an array. */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asBool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}
