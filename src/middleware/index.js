import { config, redactSecrets } from '../config.js';
import { log } from '../util/logger.js';
import { correlationId } from '../util/id.js';

const buckets = new Map();

/** Fixed-window token bucket per client key. */
export function rateLimit({ limit = config.limits.rateLimitPerHour, windowMs = 3600_000, keyFn } = {}) {
  return function rateLimitMiddleware(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    const key = keyFn ? keyFn(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      log.warn(`rate limit hit for ${key} (${bucket.count}/${limit})`);
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: `Limit is ${limit} requests per hour. Retry in ${retryAfter}s.` },
      });
    }
    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}

let active = 0;
export const generationSlots = {
  get active() {
    return active;
  },
  acquire() {
    if (active >= config.limits.maxConcurrentGenerations) return false;
    active += 1;
    return true;
  },
  release() {
    active = Math.max(0, active - 1);
  },
};

export function concurrencyGuard() {
  return function guard(req, res, next) {
    if (!generationSlots.acquire()) {
      return res.status(503).json({
        error: {
          code: 'BUSY',
          message: `${config.limits.maxConcurrentGenerations} generations are already running. Try again in a minute.`,
        },
      });
    }
    res.on('finish', () => generationSlots.release());
    res.on('close', () => generationSlots.release());
    return next();
  };
}

export function securityHeaders() {
  return function headers(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (config.corsAllowedOrigins.length) {
      res.setHeader('Access-Control-Allow-Origin', config.corsAllowedOrigins.join(','));
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (config.paths.public && req.path.startsWith('/api')) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "frame-src 'self'",
          "frame-ancestors 'self'",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; '),
      );
    }
    next();
  };
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return function handle(err, req, res, next) {
    const cid = correlationId();
    const status = err.status ?? err.statusCode ?? (err.code === 'NOT_FOUND' ? 404 : 500);
    const body = {
      error: {
        code: err.code ?? 'INTERNAL_ERROR',
        message: redactSecrets(err.message ?? 'Unexpected error'),
        correlationId: cid,
      },
    };
    if (status >= 500) log.error(`[${cid}] ${req.method} ${req.path} failed:`, err);
    else log.warn(`[${cid}] ${req.method} ${req.path} -> ${status}: ${err.message}`);
    if (res.headersSent) return;
    res.status(status).json(body);
  };
}

/** Wraps an async handler so a rejection reaches the error middleware. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
