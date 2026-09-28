/**
 * Works out which service an API key belongs to, from its shape alone.
 *
 * Detection is a *hint*, never a gate. Google issues more than one key format
 * (the classic `AIza…` and the newer `AQ.…`), so refusing anything that is not
 * recognisable would lock out keys that work perfectly well. The only keys we
 * reject on sight are the ones whose prefixes are unambiguous to another
 * vendor; everything else is decided by asking the Gemini API.
 */

/** Prefixes specific enough to name a rival vendor without guessing. */
const FOREIGN = [
  { id: 'anthropic', label: 'Anthropic', pattern: /^sk-ant-[0-9A-Za-z_-]{20,}$/ },
  { id: 'openrouter', label: 'OpenRouter', pattern: /^sk-or-v1-[0-9A-Za-z]{20,}$/ },
  { id: 'openai-project', label: 'OpenAI (project key)', pattern: /^sk-proj-[0-9A-Za-z_-]{20,}$/ },
  { id: 'xai', label: 'xAI', pattern: /^xai-[0-9A-Za-z]{20,}$/ },
  { id: 'groq', label: 'Groq', pattern: /^gsk_[0-9A-Za-z]{20,}$/ },
  { id: 'huggingface', label: 'Hugging Face', pattern: /^hf_[0-9A-Za-z]{20,}$/ },
  { id: 'replicate', label: 'Replicate', pattern: /^r8_[0-9A-Za-z]{20,}$/ },
  // Bare `sk-` is OpenAI's classic form, but DeepSeek and others copied it.
  { id: 'openai', label: 'OpenAI', pattern: /^sk-[0-9A-Za-z_-]{20,}$/, ambiguous: true },
];

/** Both shapes Google currently issues. */
const GOOGLE = [
  { id: 'google', label: 'Google AI Studio', pattern: /^AIza[0-9A-Za-z_-]{20,}$/ },
  { id: 'google', label: 'Google AI Studio', pattern: /^AQ\.[0-9A-Za-z_-]{20,}$/ },
];

const NEEDS_GOOGLE =
  'WebGen builds with Gemini, so it needs a Google AI Studio key (aistudio.google.com/apikey).';

/**
 * @param {string} key
 * @returns {{id: string, label: string, blocked: boolean, message: string}}
 *   `blocked: true` means "definitely not ours, do not bother the API".
 *   An unrecognised shape comes back blocked:false, to be settled by verifying.
 */
export function detectProvider(key) {
  const value = String(key ?? '').trim();
  if (!value) {
    return { id: 'none', label: 'no key', blocked: true, message: 'No key was supplied.' };
  }

  const foreign = FOREIGN.find((s) => s.pattern.test(value));
  if (foreign) {
    const article = /^[aeiou]/i.test(foreign.label) ? 'an' : 'a';
    const note = foreign.ambiguous
      ? ' Keys starting with sk- are also used by some other providers, so this is a best guess.'
      : '';
    return {
      id: foreign.id,
      label: foreign.label,
      blocked: true,
      message: `That looks like ${article} ${foreign.label} key.${note} ${NEEDS_GOOGLE}`,
    };
  }

  if (GOOGLE.some((s) => s.pattern.test(value))) {
    return { id: 'google', label: 'Google AI Studio', blocked: false, message: 'Google AI Studio key detected.' };
  }

  return {
    id: 'unknown',
    label: 'unrecognised format',
    blocked: false,
    message: `Not a format we recognise; checking it against the Gemini API. ${NEEDS_GOOGLE}`,
  };
}

/**
 * A value safe to put in a log line or the UI: never the key, just enough to
 * tell two keys apart.
 */
export function keyFingerprint(key) {
  const value = String(key ?? '').trim();
  if (!value) return null;
  if (value.length <= 4) return '…';
  return `…${value.slice(-4)}`;
}
