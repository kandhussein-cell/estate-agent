import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, ROOT } from './core/config.js';
import { log } from './core/logger.js';
import { getDb } from './core/db.js';
import { seedIfEmpty } from './core/seed.js';
import { startScheduler } from './core/followups.js';
import { providerName } from './core/llm/index.js';
import { chatRouter } from './routes/chat.js';
import { dashRouter } from './routes/dashboard.js';
import { whatsappRouter } from './adapters/whatsapp.js';

/** Build the Express app (exported for tests). */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], frameAncestors: config.corsOrigins.length ? ["'self'", ...config.corsOrigins] : ["'self'"], objectSrc: ["'none'"] } },
    crossOriginEmbedderPolicy: false,
  }));
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '50kb', verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/chat/message', rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages, slow down.' } }));
  app.use('/api/dash/login', rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } }));

  app.get('/healthz', (req, res) => res.json({ ok: true, provider: providerName() }));
  app.use('/api', chatRouter);
  app.use('/api/dash', dashRouter);
  app.use(whatsappRouter);

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(ROOT, 'public', 'dashboard.html')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

  // centralized error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error('http_error', { path: req.path, msg: err.message });
    if (res.headersSent) return res.end();
    res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal error' });
  });
  return app;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  getDb();
  seedIfEmpty();
  startScheduler();
  createApp().listen(config.port, () => {
    log.info('server_started', { port: config.port, provider: providerName(), demo: config.demoMode });
    console.log(`\n  Chat:      http://localhost:${config.port}/\n  Dashboard: http://localhost:${config.port}/dashboard  (PIN from .env, default 1234)\n  LLM:       ${providerName()}${providerName() === 'mock' ? '  (no ANTHROPIC_API_KEY → offline demo engine)' : ''}\n`);
  });
}
