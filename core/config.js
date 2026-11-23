import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Central, validated runtime configuration (read once from env). */
export const config = {
  port: Number(process.env.PORT || 3270),
  defaultOffice: process.env.DEFAULT_OFFICE || 'beirut-homes',
  dashboardPin: process.env.DASHBOARD_PIN || '1234',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  demoMode: (process.env.DEMO_MODE ?? 'true') !== 'false',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/app.db'),
  llm: {
    provider: process.env.LLM_PROVIDER || 'auto',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    timeoutMs: 30000,
    retries: 1,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    models: (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.8-flash').split(',').map((m) => m.trim()).filter(Boolean),
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
};
