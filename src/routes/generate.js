import path from 'node:path';
import config from '../config.js';
import { log } from '../util/logger.js';
import { gemini } from '../gemini/client.js';
import { generateSite, applyEdit, STAGES } from '../pipeline/orchestrate.js';
import { asyncHandler, rateLimit, concurrencyGuard } from '../middleware/index.js';
import store from '../store.js';

const MAX_BRIEF = 4000;

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': webgen stream open\n\n');
  const keepalive = setInterval(() => res.write(': ping\n\n'), 15000);
  const close = () => clearInterval(keepalive);
  res.on('close', close);
  res.on('error', close);
  return {
    send(event) {
      if (res.writableEnded) return;
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end(event) {
      if (res.writableEnded) return;
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      clearInterval(keepalive);
      res.end();
    },
  };
}

export function normaliseOptions(raw = {}) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const listOf = (v) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return {
    pageType: o.pageType ? String(o.pageType).slice(0, 40) : null,
    pages: listOf(o.pages).slice(0, 8),
    brandName: o.brandName ? String(o.brandName).slice(0, 40) : null,
    styleNotes: o.styleNotes ? String(o.styleNotes).slice(0, 600) : null,
    archetype: o.archetype ? String(o.archetype).slice(0, 40) : null,
    darkMode: o.darkMode === undefined ? null : Boolean(o.darkMode),
    include: listOf(o.include),
    analyticsId: o.analyticsId ? String(o.analyticsId).slice(0, 32) : null,
    projectName: o.projectName ? String(o.projectName).slice(0, 40) : null,
  };
}

export function registerGenerateRoutes(app) {
  const limiter = rateLimit({ limit: config.limits.rateLimitPerHour });

  app.post(
    '/api/generate',
    limiter,
    concurrencyGuard(),
    asyncHandler(async (req, res) => {
      const brief = String(req.body?.brief ?? '').trim();
      if (!brief) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A brief is required. Describe the site you want in one line.' } });
      }
      if (brief.length > MAX_BRIEF) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Brief is too long (${brief.length} characters, max ${MAX_BRIEF}).` } });
      }
      const options = normaliseOptions(req.body?.options);

      const sse = openSse(res);
      let record = null;
      try {
        record = await store.create({ brief, options });
        sse.send({ type: 'site', siteId: record.id, stages: STAGES, mode: gemini.resolveMode() });
        sse.send({ type: 'log', message: `Site ${record.id} created.` });

        const result = await generateSite({
          brief,
          options,
          siteDir: record.dir,
          client: gemini,
          emit: (event) => sse.send(event),
        });

        const finalReport = result.report;
        await store.update(record.id, {
          status: finalReport.pass ? 'ready' : 'degraded',
          degraded: !finalReport.pass,
          plan: result.plan,
          designSystem: result.design,
          analysis: result.analysis,
          skills: result.skills,
          files: result.fileList,
          routes: result.routes,
          report: finalReport,
          usage: result.usage,
          model: result.model,
          fingerprint: result.fingerprint,
          brief: result.brief,
        });

        sse.send({
          type: 'result',
          siteId: record.id,
          routes: result.routes,
          files: result.fileList,
          report: finalReport,
          usage: result.usage,
          durationMs: result.durationMs,
          degraded: result.degraded,
          previewUrl: `/api/sites/${record.id}/raw/index.html`,
        });
        sse.end({ type: 'done', siteId: record.id, ok: true });
      } catch (err) {
        log.error('generate failed:', err);
        if (record) {
          await store.update(record.id, { status: 'failed', degraded: true, report: { pass: false, blocking: [{ rule: err.code ?? 'ERROR', message: err.message }], warnings: [] } });
        }
        sse.end({ type: 'error', message: err.message ?? String(err), code: err.code ?? 'GENERATE_FAILED', siteId: record?.id ?? null });
      }
      return undefined;
    }),
  );

  app.post(
    '/api/edit',
    limiter,
    asyncHandler(async (req, res) => {
      const siteId = String(req.body?.siteId ?? '');
      const instruction = String(req.body?.instruction ?? '').trim();
      if (!siteId || !instruction) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'siteId and instruction are both required.' } });
      }
      if (instruction.length > 2000) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Instruction is too long (max 2000 characters).' } });
      }
      const sse = openSse(res);
      try {
        const result = await applyEdit({
          siteId,
          instruction,
          client: gemini,
          emit: (event) => sse.send(event),
        });
        sse.send({ type: 'result', ...result });
        sse.end({ type: 'done', ok: true });
      } catch (err) {
        sse.end({ type: 'error', message: err.message ?? String(err), code: err.code ?? 'EDIT_FAILED' });
      }
      return undefined;
    }),
  );
}

export { openSse, path };
