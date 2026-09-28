import config from './config.js';
import { log } from './util/logger.js';
import store from './store.js';
import { registerGenerateRoutes } from './routes/generate.js';
import { registerSiteRoutes } from './routes/sites.js';
import { securityHeaders, notFound, errorHandler } from './middleware/index.js';
import { providerMode, hasApiKey } from './config.js';

export async function createServer() {
  const express = (await import('express')).default;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));
  app.use(securityHeaders());

  await store.init();

  registerSiteRoutes(app);
  registerGenerateRoutes(app);

  app.use(express.static(config.paths.public, { index: 'index.html', maxAge: 0 }));

  app.use(notFound);
  app.use(errorHandler());

  return app;
}

export async function start() {
  const app = await createServer();
  const server = app.listen(config.port, config.host, () => {
    const mode = providerMode();
    log.info(`WebGen listening on http://${config.host}:${config.port}`);
    if (mode === 'mock') {
      log.warn(
        hasApiKey()
          ? 'GEMINI_MOCK is on, so the mock provider is answering instead of the real model.'
          : 'No GEMINI_API_KEY found. Running against the mock provider — the pipeline is real, the model is not.',
      );
    } else if (mode === 'unconfigured') {
      log.error('No GEMINI_API_KEY and GEMINI_USE_MOCK_IF_NO_KEY=0. Add a key to .env (see .env.example).');
    } else {
      log.info(`Model: ${config.gemini.model} (quality tier: ${config.gemini.modelPro})`);
    }
    const readiness = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'NETLIFY_AUTH_TOKEN', 'GITHUB_TOKEN']
      .filter((k) => !process.env[k]);
    if (readiness.length) {
      log.debug(`deploy credentials not set: ${readiness.join(', ')} — deploy falls back to one-command instructions`);
    }
  });

  const shutdown = (signal) => {
    log.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  start().catch((err) => {
    log.error('failed to start:', err);
    process.exit(1);
  });
}
