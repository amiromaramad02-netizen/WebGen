import fs from 'node:fs/promises';
import path from 'node:path';
import config, { hasApiKey, providerMode } from '../config.js';
import { log } from '../util/logger.js';
import store from '../store.js';
import { asyncHandler } from '../middleware/index.js';
import { gemini } from '../gemini/client.js';
import { detectProvider, keyFingerprint } from '../gemini/detectKey.js';
import { setEnvValue, unsetEnvValue } from '../util/envFile.js';
import { listFilesRecursive, readTextIfExists, dirSize } from '../util/fsx.js';
import { safeRelativePath, resolveInRoot } from '../util/paths.js';
import { createZip, createSingleFile, hostManifests } from '../pipeline/bundle.js';
import { deploySite, deployReadiness, PROVIDER_LIST } from '../deploy/index.js';
import { SKILLS, SKILL_GROUPS } from '../design/skills.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function notFound(res, message) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

export function registerSiteRoutes(app) {
  /* ------------------------------------------------------------- health */
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, mode: providerMode(), uptimeSeconds: Math.round(process.uptime()) });
  });

  /* -------------------------------------------------------- capabilities */
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      provider: {
        // The client's own resolution, not providerMode(): a key pasted into
        // the UI outranks the GEMINI_MOCK env flag.
        mode: gemini.resolveMode(),
        hasApiKey: hasApiKey(),
        model: config.gemini.model,
        modelPro: config.gemini.modelPro,
        source: gemini.keySource,
        label: gemini.resolveMode() === 'live' ? detectProvider(gemini.apiKey).label : null,
      },
      deploy: deployReadiness(),
      limits: {
        rateLimitPerHour: config.limits.rateLimitPerHour,
        maxConcurrentGenerations: config.limits.maxConcurrentGenerations,
        filesMaxPerSite: config.limits.filesMaxPerSite,
        fileMaxBytes: config.limits.fileMaxBytes,
        repairMaxAttempts: config.limits.repairMaxAttempts,
        siteTtlHours: config.limits.siteTtlHours,
      },
      qa: config.qa,
    });
  });

  app.post(
    '/api/verify-key',
    asyncHandler(async (req, res) => {
      const result = await gemini.verify();
      res.status(result.ok ? 200 : 400).json(result);
    }),
  );

  /* ------------------------------------------------------------------ key */
  /**
   * Status without the secret. Enough for the UI to show which key is in play
   * and whether it came from .env or was pasted into the browser.
   */
  app.get('/api/key', (req, res) => {
    const mode = gemini.resolveMode();
    const provider = detectProvider(gemini.apiKey);
    res.json({
      configured: mode === 'live',
      source: gemini.keySource,
      // Only while it is genuinely in use, so an idle key in .env is not
      // advertised by a fingerprint.
      provider: { id: mode === 'live' ? provider.id : 'none', label: mode === 'live' ? provider.label : 'no key' },
      fingerprint: mode === 'live' ? keyFingerprint(gemini.apiKey) : null,
      model: config.gemini.model,
      modelPro: config.gemini.modelPro,
      mock: mode === 'mock',
    });
  });

  /**
   * Takes a key pasted in the browser, works out which service it belongs to,
   * and adopts it. A key we cannot drive is rejected here rather than
   * halfway through a generation.
   */
  app.post(
    '/api/key',
    asyncHandler(async (req, res) => {
      const key = String(req.body?.key ?? '').trim();
      if (!key) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Paste a key first.' } });
      }
      if (key.length < 20) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'That is too short to be an API key.' } });
      }

      const provider = detectProvider(key);
      if (provider.blocked) {
        log.warn(`rejected ${provider.id} key: ${keyFingerprint(key)}`);
        return res.status(400).json({
          error: { code: 'UNSUPPORTED_PROVIDER', message: provider.message },
          provider: { id: provider.id, label: provider.label, blocked: true },
        });
      }

      // Adopt it before verifying so the check runs against the new key. An
      // unrecognised shape is settled here: if Gemini accepts it, it is ours.
      gemini.setKey(key);
      const verified = await gemini.verify();
      if (!verified.ok) {
        gemini.clearKey();
        return res.status(400).json({
          error: { code: 'KEY_REJECTED', message: `${provider.id === 'unknown' ? 'The Gemini API did not accept that key. ' : ''}${verified.message}` },
          provider: { id: provider.id, label: provider.label, blocked: false },
        });
      }

      let saved = false;
      if (req.body?.save !== false) {
        await setEnvValue('GEMINI_API_KEY', key);
        saved = true;
        log.info(`key saved to .env (${provider.label}, ${keyFingerprint(key)})`);
      } else {
        log.info(`key applied for this process only (${provider.label}, ${keyFingerprint(key)})`);
      }

      return res.json({
        ok: true,
        saved,
        source: gemini.keySource,
        provider: { id: 'google', label: 'Google AI Studio', blocked: false },
        fingerprint: keyFingerprint(key),
        model: config.gemini.model,
        message: `Google AI Studio key verified${saved ? ' and saved to .env' : ' for this session'}. ${verified.message}`,
      });
    }),
  );

  /**
   * Drops the key in memory. It is only removed from .env when the caller asks
   * for it explicitly with ?purge=1, so clearing a session key can never
   * silently destroy the saved one.
   */
  app.delete(
    '/api/key',
    asyncHandler(async (req, res) => {
      const had = Boolean(gemini.apiKey);
      gemini.clearKey();
      const purge = req.query.purge === '1' || req.body?.purge === true;
      const removed = purge ? await unsetEnvValue('GEMINI_API_KEY') : false;
      if (had || removed) log.info(purge ? 'key cleared from memory and .env' : 'key cleared from memory');
      res.json({ ok: true, purged: purge, removed, mode: gemini.resolveMode() });
    }),
  );

  app.get('/api/skills', (req, res) => {
    res.json({
      groups: SKILL_GROUPS,
      skills: Object.fromEntries(
        Object.entries(SKILLS).map(([group, set]) => [
          group,
          Object.entries(set).map(([id, s]) => ({ id, instruction: s.instruction, prompt: s.prompt ?? null })),
        ]),
      ),
    });
  });

  app.get('/api/archetypes', (req, res) => {
    res.json({ layout: Object.keys(SKILLS.layout) });
  });

  /* --------------------------------------------------------------- list */
  app.get(
    '/api/sites',
    asyncHandler(async (req, res) => {
      res.json({ sites: await store.list({ limit: Number(req.query.limit) || 20 }) });
    }),
  );

  /* -------------------------------------------------------------- detail */
  app.get(
    '/api/sites/:id',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired. Generate it again.');
      res.json({
        id: record.id,
        brief: record.brief,
        status: record.status,
        degraded: record.degraded,
        brandName: record.plan?.brandName,
        tagline: record.plan?.tagline,
        routes: record.routes,
        files: record.files,
        skills: record.skills ?? [],
        analysis: record.analysis,
        report: record.report,
        usage: record.usage,
        deployment: record.deployment,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        bytes: await dirSize(record.dir),
      });
    }),
  );

  /* --------------------------------------------------------- raw file read */
  app.get(
    '/api/sites/:id/raw/*',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      const rel = safeRelativePath(decodeURIComponent(req.params[0] ?? 'index.html'));
      if (!rel) return notFound(res, 'Invalid file path.');
      const abs = resolveInRoot(record.dir, rel);
      if (!abs) return notFound(res, 'Invalid file path.');
      const data = await readTextIfExists(abs);
      if (data === null) {
        const exists = await fs.readFile(abs).catch(() => null);
        if (!exists) return notFound(res, `${rel} is not in this site.`);
        res.setHeader('Content-Type', CONTENT_TYPES[path.extname(rel).toLowerCase()] ?? 'application/octet-stream');
        return res.end(exists);
      }
      res.setHeader('Content-Type', CONTENT_TYPES[path.extname(rel).toLowerCase()] ?? 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(data);
    }),
  );

  /* ------------------------------------------------------------- download */
  app.get(
    '/api/sites/:id/bundle',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      const { buffer, entries, bytes } = await createZip(record.dir, { siteName: slugName(record) });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${slugName(record)}.zip"`);
      res.setHeader('X-File-Count', String(entries));
      res.setHeader('X-Total-Bytes', String(bytes));
      log.info(`bundle ${record.id}: ${entries} files, ${(bytes / 1024).toFixed(1)} KB`);
      return res.end(buffer);
    }),
  );

  app.get(
    '/api/sites/:id/single',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      const page = safeRelativePath(String(req.query.page ?? 'index.html')) ?? 'index.html';
      const { html, inlined } = await createSingleFile(record.dir, { page });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slugName(record)}-single.html"`);
      res.setHeader('X-Inlined-Assets', String(inlined.length));
      return res.end(html);
    }),
  );

  app.get(
    '/api/sites/:id/manifests',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      res.json({ files: hostManifests(slugName(record)), providers: PROVIDER_LIST, readiness: deployReadiness() });
    }),
  );

  /* --------------------------------------------------------------- deploy */
  app.post(
    '/api/sites/:id/deploy',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      const provider = String(req.body?.provider ?? config.deploy.provider);
      if (!PROVIDER_LIST.includes(provider)) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `provider must be one of ${PROVIDER_LIST.join(', ')}` } });
      }
      const result = await deploySite({
        siteId: record.id,
        siteDir: record.dir,
        plan: record.plan,
        provider,
        projectName: req.body?.projectName,
      });
      if (result.ok) {
        await store.update(record.id, { deployment: { ...result, deployedAt: Date.now() } });
        return res.json(result);
      }
      // A not-configured provider is not an error: hand back the exact commands.
      return res.status(200).json(result);
    }),
  );

  app.delete(
    '/api/sites/:id',
    asyncHandler(async (req, res) => {
      const ok = await store.destroy(req.params.id);
      if (!ok) return notFound(res, 'Site not found.');
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/sites/:id/files',
    asyncHandler(async (req, res) => {
      const record = store.get(req.params.id);
      if (!record) return notFound(res, 'Site not found or expired.');
      const rel = safeRelativePath(String(req.query.path ?? 'index.html'));
      if (!rel) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid file path.' } });
      const abs = resolveInRoot(record.dir, rel);
      const content = abs ? await readTextIfExists(abs) : null;
      if (content === null) return notFound(res, `${rel} is not in this site.`);
      res.json({ path: rel, bytes: content.length, content });
    }),
  );
}

function slugName(record) {
  const base = record.plan?.brandName ?? 'webgen-site';
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'webgen-site';
}

export { listFilesRecursive };
