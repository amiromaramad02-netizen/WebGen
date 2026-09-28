import config from '../config.js';
import { log } from '../util/logger.js';
import { safeJsonParse } from '../util/safeJson.js';
import { createMockProvider } from './mockProvider.js';

/** USD per 1M tokens, used only for a rough estimate shown in the UI. */
/** USD per 1M tokens. Pro is the expensive tier; the *-latest aliases bill as their base. */
const PRICING = {
  'gemini-3.8-flash': { input: 0.30, output: 2.50 },
  'gemini-flash-latest': { input: 0.30, output: 2.50 },
  'gemini-pro-latest': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  default: { input: 0.30, output: 2.50 },
};

export class GeminiError extends Error {
  constructor(message, { code = 'GEMINI_ERROR', retryable = false, cause } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

export class TruncatedResponseError extends GeminiError {
  constructor(message) {
    super(message, { code: 'MAX_TOKENS' });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => Math.min(8000, 400 * 2 ** attempt) + Math.floor(Math.random() * 250);
// 503 means the model is oversubscribed, not that our request was wrong, so it
// gets a much longer ceiling: waiting it out is the actual fix.
const backoffFor = (info, attempt) => (info?.status === 503
  ? Math.min(45000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 2000)
  : backoff(attempt));

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Thin, dependency-light wrapper around @google/genai.
 * - server-only key
 * - per-call timeout
 * - retry with jitter, and model downgrade on 429
 * - usage metering
 * - never throws raw SDK errors at the pipeline
 */
export class GeminiClient {
  constructor(opts = {}) {
    this.mode = opts.mode ?? null;
    this.apiKey = opts.apiKey ?? config.gemini.apiKey;
    this.model = opts.model ?? config.gemini.model;
    this.modelPro = opts.modelPro ?? config.gemini.modelPro;
    this.totalRetriesMax = opts.totalRetriesMax ?? config.gemini.totalRetriesMax;
    this.callTimeoutMs = opts.callTimeoutMs ?? config.gemini.callTimeoutMs;
    this.thinkingBudgetDefault = opts.thinkingBudget ?? config.gemini.thinkingBudgetDefault;
    this.usage = { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0, calls: 0, requests: 0, costUsd: 0 };
    this._sdk = null;
    this._mock = null;
    this._resolvedMode = this.mode;
    // 'env' until someone pastes a key into the UI; a pasted key is an
    // explicit request for live output, so it outranks the mock env flag.
    this.keySource = 'env';
  }

  /**
   * Adopts a key supplied at runtime. Drops the cached SDK so the next call
   * rebuilds it, and mirrors the value into config so hasApiKey(),
   * providerMode() and redactSecrets() all agree with what we will really use.
   */
  setKey(key) {
    this.apiKey = String(key ?? '').trim();
    this._sdk = null;
    this._resolvedMode = null;
    this.keySource = this.apiKey ? 'runtime' : 'env';
    config.gemini.apiKey = this.apiKey;
    return this.apiKey;
  }

  /** Returns to whatever .env says, dropping any pasted key. */
  clearKey() {
    this.apiKey = '';
    this._sdk = null;
    this._resolvedMode = null;
    this.keySource = 'env';
    config.gemini.apiKey = config.gemini.envApiKey ?? '';
  }

  resolveMode() {
    if (this._resolvedMode) return this._resolvedMode;
    if (this.keySource === 'runtime' && this.apiKey) this._resolvedMode = 'live';
    else if (config.gemini.mock) this._resolvedMode = 'mock';
    else if (this.apiKey && this.apiKey.length > 10) this._resolvedMode = 'live';
    else if (config.gemini.useMockIfNoKey) this._resolvedMode = 'mock';
    else this._resolvedMode = 'unconfigured';
    return this._resolvedMode;
  }

  get mode_() {
    return this.resolveMode();
  }

  async getSdk() {
    if (this._sdk) return this._sdk;
    const { GoogleGenAI } = await import('@google/genai');
    this._sdk = new GoogleGenAI({ apiKey: this.apiKey });
    return this._sdk;
  }

  async getMock() {
    if (!this._mock) this._mock = createMockProvider();
    return this._mock;
  }

  addUsage(usageMetadata, model) {
    if (!usageMetadata) return;
    const prompt = Number(usageMetadata.promptTokenCount ?? 0);
    const candidates = Number(usageMetadata.candidatesTokenCount ?? 0);
    const thoughts = Number(usageMetadata.thoughtsTokenCount ?? 0);
    const total = Number(usageMetadata.totalTokenCount ?? prompt + candidates + thoughts);
    this.usage.promptTokens += prompt;
    this.usage.candidatesTokens += candidates;
    this.usage.thoughtsTokens += thoughts;
    this.usage.totalTokens += total;
    this.usage.calls += 1;
    this.usage.requests += 1;
    const price = PRICING[model] ?? PRICING.default;
    this.usage.costUsd +=
      (prompt / 1e6) * price.input + (candidates / 1e6) * price.output;
  }

  mergeUsage(other) {
    for (const key of ['promptTokens', 'candidatesTokens', 'thoughtsTokens', 'totalTokens', 'calls', 'requests', 'costUsd']) {
      this.usage[key] += Number(other.usage?.[key] ?? 0);
    }
  }

  resetUsage() {
    this.usage = { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0, calls: 0, requests: 0, costUsd: 0 };
  }

  /**
   * Structured (JSON-schema) generation.
   * @returns {Promise<{data: object, text: string, raw: string, model: string, usage: object}>}
   */
  async generateJson({
    systemInstruction,
    prompt,
    schema,
    model,
    temperature = 0.6,
    maxOutputTokens = 8000,
    thinkingBudget = null,
    label = 'call',
  }) {
    const result = await this.generate({
      systemInstruction,
      prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature,
        maxOutputTokens,
        thinkingBudget,
      },
      model,
      label,
    });

    const parsed = safeJsonParse(result.text);
    if (!parsed.ok) {
      throw new GeminiError(`Model returned unparseable JSON (${parsed.error})`, {
        code: 'INVALID_JSON',
        retryable: true,
      });
    }
    return { ...result, data: parsed.value };
  }

  /** Text generation, optionally streamed, with per-chunk callbacks. */
  async generate({
    systemInstruction,
    prompt,
    config: genConfig = {},
    model,
    stream = false,
    onChunk,
    label = 'call',
  }) {
    const mode = this.resolveMode();
    if (mode === 'mock') return this._generateMock({ prompt, genConfig, model, onChunk, label });
    if (mode === 'unconfigured') {
      throw new GeminiError(
        'GEMINI_API_KEY is not set. Add it to .env or use the setup screen.',
        { code: 'NO_API_KEY', retryable: false },
      );
    }
    return this._generateLive({ systemInstruction, prompt, genConfig, model, stream, onChunk, label });
  }

  async _generateLive({ systemInstruction, prompt, genConfig, model, stream, onChunk, label }) {
    const sdk = await this.getSdk();
    let activeModel = model ?? this.model;
    let probedPro = false;
    let attempt = 0;
    let lastError;

    while (attempt <= this.totalRetriesMax) {
      const started = Date.now();
      try {
        const request = {
          model: activeModel,
          contents: prompt,
          config: {
            ...genConfig,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(config.gemini.blockOnlyHigh
              ? {
                  safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                  ],
                }
              : {}),
          },
        };

        if (stream) {
          const streamIter = await sdk.models.generateContentStream(request);
          let text = '';
          let usage = null;
          let finishReason = 'STOP';
          for await (const chunk of streamIter) {
            const piece = chunk.text ?? '';
            if (piece) {
              text += piece;
              onChunk?.(piece, text);
            }
            if (chunk.usageMetadata) usage = chunk.usageMetadata;
            if (chunk.candidates?.[0]?.finishReason) finishReason = chunk.candidates[0].finishReason;
          }
          this.addUsage(usage, activeModel);
          if (finishReason === 'MAX_TOKENS') {
            throw new TruncatedResponseError(
              `Response for ${label} hit the token ceiling mid-file; refusing to ship a truncated file.`,
            );
          }
          log.debug(`gemini: ${label} ok (${activeModel}, ${Date.now() - started}ms, ${text.length} chars)`);
          return { text, model: activeModel, usage, finishReason };
        }

        const response = await withTimeout(
          sdk.models.generateContent(request),
          this.callTimeoutMs,
          label,
        );
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason ?? 'STOP';
        const text = (candidate?.content?.parts ?? [])
          .map((p) => p.text ?? '')
          .join('');
        this.addUsage(response.usageMetadata, activeModel);

        if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'PROHIBITED_CONTENT') {
          throw new GeminiError(`Blocked by ${finishReason} for ${label}`, {
            code: finishReason,
            retryable: true,
          });
        }
        if (finishReason === 'MAX_TOKENS' || !text) {
          throw new TruncatedResponseError(`Response for ${label} was truncated or empty.`);
        }
        log.debug(`gemini: ${label} ok (${activeModel}, ${Date.now() - started}ms, ${text.length} chars)`);
        return { text, model: activeModel, usage: response.usageMetadata, finishReason };
      } catch (err) {
        lastError = normaliseError(err);
        const status = lastError.status;
        if (lastError.quotaExhausted) {
          lastError.message += ` ${explainQuota(activeModel)}`;
          break;
        }
        // Probe the other model once. Free-tier pro access is often zero, so
        // hopping back and forth would waste every retry on two dead ends.
        if ((status === 429 || status === 503) && !probedPro && model === undefined) {
          probedPro = true;
          activeModel = activeModel === this.modelPro ? this.model : this.modelPro;
          log.warn(`gemini: ${status} on ${label}; trying ${activeModel} once for the retry`);
        }
        if (!lastError.retryable || attempt >= this.totalRetriesMax) break;
        const wait = lastError.retryAfterMs ?? backoffFor(lastError, attempt);
        log.warn(`gemini: ${label} failed (${lastError.code}); retry ${attempt + 1}/${this.totalRetriesMax} in ${wait}ms`);
        await sleep(wait);
        attempt += 1;
      }
    }

    let detail = humaniseApiMessage(lastError?.message);
    const exhausted = /UNAVAILABLE|503/.test(detail)
      ? 'the model is at capacity right now — wait a minute and run it again'
      : detail;
    throw new GeminiError(
      `Gemini call "${label}" failed after ${attempt + 1} attempt(s): ${exhausted}`,
      { code: lastError?.code ?? 'GEMINI_ERROR', retryable: false, cause: lastError },
    );
  }

  async _generateMock({ prompt, genConfig, onChunk, label }) {
    const mock = await this.getMock();
    const result = mock.respond({ prompt, genConfig, label });
    const text = result.text;
    if (onChunk) {
      const chunkSize = 240;
      for (let i = 0; i < text.length; i += chunkSize) {
        onChunk(text.slice(i, i + chunkSize), text.slice(0, i + chunkSize));
      }
    }
    this.addUsage(result.usage, 'mock');
    return { text, model: 'mock', usage: result.usage, finishReason: 'STOP', mock: true };
  }

  /** Cheap connectivity/validity probe used by the setup screen. */
  async verify() {
    if (this.resolveMode() === 'mock') {
      return { ok: true, mode: 'mock', message: 'Mock provider active — no key required.' };
    }
    if (this.resolveMode() === 'unconfigured') {
      return { ok: false, mode: 'unconfigured', message: 'GEMINI_API_KEY is missing.' };
    }
    try {
      const sdk = await this.getSdk();
      // A fresh flash model answers 503 "high demand" often enough that a single
      // attempt would fail users on a working key. Retry like a real call does.
      const res = await withRetries(() => withTimeout(
        sdk.models.generateContent({
          model: this.model,
          contents: 'Reply with the single word: ok',
          config: {
            maxOutputTokens: 2048,
            temperature: 0,
            thinkingConfig: { thinkingBudget: this.thinkingBudgetDefault },
          },
        }),
        30000,
        'verify',
      ));
      this.addUsage(res.usageMetadata, this.model);
      const text = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (!text) {
        return {
          ok: false,
          mode: 'live',
          message: `Model ${this.model} answered with no text (finishReason: ${res.candidates?.[0]?.finishReason ?? 'unknown'}). It may be thinking past the token budget.`,
        };
      }
      const thoughts = res.usageMetadata?.thoughtsTokenCount;
      return {
        ok: true,
        mode: 'live',
        message: `Key verified. Model ${this.model} responded: "${text.slice(0, 20)}"${thoughts ? ` (thought ${thoughts} tokens)` : ''}`,
      };
    } catch (err) {
      const info = normaliseError(err);
      if (info.quotaExhausted) {
        return { ok: false, mode: 'live', message: `Key check failed: quota exhausted. ${explainQuota(this.model)}` };
      }
      // The raw SDK message can echo the request; keep it to one readable line.
      const oneLine = humaniseApiMessage(info.message).replace(/\s+/g, ' ').trim();
      return { ok: false, mode: 'live', message: `Key check failed: ${oneLine || 'the model did not answer.'}` };
    }
  }
}

/** Retries on transient failures only; a bad model or key fails immediately. */
async function withRetries(fn, { max = 4, onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      const info = normaliseError(err);
      lastErr = err;
      if (!info.retryable || attempt === max) throw err;
      const wait = backoff(attempt);
      onRetry?.(info, wait);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GeminiError(`Call "${label}" exceeded ${ms}ms`, { code: 'TIMEOUT', retryable: true }));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * A free-tier key gets a small daily request allowance and often none at all for
 * the pro tier. Say which it is, and what actually fixes it.
 */
function explainQuota(model) {
  return (
    `The Gemini free tier allows only a small number of requests per day and none for most pro models; ` +
    `${model} is out of allowance right now. Add a billing method to the AI Studio project to lift it, ` +
    `or keep using mock mode (GEMINI_MOCK=1), which needs no quota.`
  );
}

/** Google tells us how long to wait in a RetryInfo detail. Honour it, capped. */
function parseRetryAfter(details) {
  const entry = (Array.isArray(details) ? details : []).find((d) => d?.['@type']?.endsWith('RetryInfo'));
  const seconds = Number.parseFloat(entry?.retryDelay);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 60000) : null;
}

/**
 * The SDK hands back the whole response body as `err.message`, so the useful
 * prose sits inside a JSON string. Pull it out instead of truncating at the
 * first brace, which on a pure-JSON message leaves nothing at all to show.
 */
function humaniseApiMessage(message) {
  const raw = String(message ?? '').trim();
  if (!raw) return 'unknown error';
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message ?? parsed?.message;
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  } catch {
    // Not JSON on its own; fall through to the trailing-blob trim.
  }
  // A mixed message ("got status: 429 {json}") only loses the blob when there
  // is real text in front of it; otherwise keep what we were given.
  const blobAt = raw.indexOf('{');
  return blobAt > 0 ? raw.slice(0, blobAt).trim() : raw;
}

function normaliseError(err) {
  if (err instanceof GeminiError) return err;
  const status = err?.status ?? err?.code ?? err?.response?.status;
  let message = humaniseApiMessage(err?.message ?? String(err));
  const numericStatus = typeof status === 'number' ? status : undefined;
  // A new AI Studio account gets 404s for the older model ids. Say what to do.
  if (/no longer available to new users|is not found for API version/i.test(message)) {
    message += ' Set GEMINI_MODEL and GEMINI_MODEL_PRO in .env to models your key can reach (npm run verify:key tries the current ones).';
  }
  // "Quota exceeded ... limit: 0" is not a rate limit, it is an empty allowance.
  // Retrying it just burns the whole budget against a model that can never answer.
  const quotaExhausted = /quota exceeded/i.test(message) && (/limit:\s*0\b/.test(message) || /RESOURCE_EXHAUSTED/.test(message));
  const retryable = quotaExhausted
    ? false
    : numericStatus !== undefined
      ? isRetryableStatus(numericStatus)
      : /overloaded|rate|429|503|500|timed?\s*out|unavailable|ECONNRESET|fetch failed/i.test(message);
  return {
    message,
    status: numericStatus,
    code: quotaExhausted ? 'QUOTA_EXHAUSTED' : numericStatus !== undefined ? `HTTP_${numericStatus}` : retryable ? 'TRANSIENT' : 'GEMINI_ERROR',
    retryable,
    quotaExhausted,
    retryAfterMs: parseRetryAfter(err?.details ?? err?.response?.data?.details),
    raw: err,
  };
}

export const gemini = new GeminiClient();
export default gemini;
