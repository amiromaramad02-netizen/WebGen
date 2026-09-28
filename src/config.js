// Loads .env (if present) and exposes every runtime knob in ONE place.
// Nothing else in the codebase reads process.env for configuration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnv();

const str = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};
const num = (key, fallback) => {
  const raw = str(key, '').trim();
  if (raw === '') return fallback; // Number('') is 0, which would silently zero every limit
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (key, fallback = false) => {
  const v = str(key, '');
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
};

export const config = {
  root: ROOT,
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  logLevel: str('LOG_LEVEL', 'info'),
  preventKeyLogs: bool('PREVENT_KEY_LOGS', true),

  paths: {
    public: path.join(ROOT, 'public'),
    sites: path.join(ROOT, 'sites'),
    tests: path.join(ROOT, 'tests'),
  },

  gemini: {
    apiKey: str('GEMINI_API_KEY', ''),
    // The pristine .env value, kept so clearing a key pasted through the UI
    // falls back to the environment instead of to nothing.
    envApiKey: str('GEMINI_API_KEY', ''),
    model: str('GEMINI_MODEL', 'gemini-3.8-flash'),
    modelPro: str('GEMINI_MODEL_PRO', 'gemini-pro-latest'),
    mock: bool('GEMINI_MOCK', false),
    useMockIfNoKey: bool('GEMINI_USE_MOCK_IF_NO_KEY', true),
    streamPage: bool('GEMINI_STREAM_PAGE', true),
    blockOnlyHigh: bool('GEMINI_SAFETY_BLOCK_ONLY_HIGH', true),
    thinkingBudgetDefault: num('GEMINI_THINKING_DEFAULT', -1),
    maxTokens: {
      plan: num('GEMINI_MAX_TOKENS_PLAN', 20000),
      design: num('GEMINI_MAX_TOKENS_DESIGN', 20000),
      page: num('GEMINI_MAX_TOKENS_PAGE', 30000),
      repair: num('GEMINI_MAX_TOKENS_REPAIR', 20000),
      edit: num('GEMINI_MAX_TOKENS_EDIT', 20000),
    },
    callTimeoutMs: num('CALL_TIMEOUT_MS', 45000),
    totalRetriesMax: num('TOTAL_RETRIES_MAX', 6),
    sliceBytesOnMaxTokens: num('SLICE_BYTES_ON_MAX_TOKENS', 8000),
  },

  limits: {
    siteTtlHours: num('SITE_TTL_HOURS', 72),
    maxSitesInMemory: num('MAX_SITES_IN_MEMORY', 20),
    rateLimitPerHour: num('RATE_LIMIT_PER_HOUR', 10),
    maxConcurrentGenerations: num('MAX_CONCURRENT_GENERATIONS', 2),
    filesMaxPerSite: num('FILES_MAX_PER_SITE', 60),
    fileMaxBytes: num('FILE_MAX_BYTES', 256000),
    repairMaxAttempts: num('REPAIR_MAX_ATTEMPTS', 3),
    uploadConcurrency: num('UPLOAD_CONCURRENCY', 4),
  },

  qa: {
    playwright: bool('ENABLE_PLAYWRIGHT_QA', true),
    lighthouse: bool('ENABLE_LIGHTHOUSE_QA', true),
    lighthouseMobileOnly: bool('LIGHTHOUSE_MOBILE_ONLY', true),
  },

  preview: {
    sandbox: str(
      'SANDBOX_PREVIEW',
      'allow-scripts allow-forms allow-same-origin allow-popups',
    ),
  },

  deploy: {
    provider: str('DEPLOY_PROVIDER', 'cloudflare'),
    cloudflare: {
      accountId: str('CLOUDFLARE_ACCOUNT_ID', ''),
      apiToken: str('CLOUDFLARE_API_TOKEN', ''),
    },
    netlify: {
      authToken: str('NETLIFY_AUTH_TOKEN', ''),
      siteId: str('NETLIFY_SITE_ID', ''),
    },
    github: {
      token: str('GITHUB_TOKEN', ''),
      repo: str('GITHUB_REPO', ''),
    },
  },

  corsAllowedOrigins: str('CORS_ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

/** Redacts any occurrence of the API key in arbitrary text before logging. */
export function redactSecrets(input) {
  let out = String(input ?? '');
  const secret = config.gemini.apiKey;
  if (config.preventKeyLogs && secret && secret.length > 8) {
    out = out.split(secret).join('[REDACTED_API_KEY]');
  }
  out = out.replace(/(AIza[0-9A-Za-z_-]{10,})/g, '[REDACTED_API_KEY]');
  out = out.replace(/(Bearer\s+)([A-Za-z0-9._-]{16,})/g, '$1[REDACTED_TOKEN]');
  out = out.replace(/(["']?(?:api[_-]?key|token|authorization)["']?\s*[:=]\s*)["'][^"']{8,}["']/gi,
    '$1"[REDACTED]"');
  return out;
}

export function hasApiKey() {
  return Boolean(config.gemini.apiKey && config.gemini.apiKey.length > 10);
}

export function providerMode() {
  if (config.gemini.mock) return 'mock';
  if (hasApiKey()) return 'live';
  if (config.gemini.useMockIfNoKey) return 'mock';
  return 'unconfigured';
}

export default config;
