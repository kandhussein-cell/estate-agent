import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Env lookup that ignores letter case, so `gemini_api_key` and `GEMINI_API_KEY` both work (hosting dashboards often lowercase names). */
export const env = (name, fallback = '') => {
  if (process.env[name] !== undefined && process.env[name] !== '') return process.env[name];
  const hit = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase() && process.env[k] !== '');
  return hit ? process.env[hit] : fallback;
};

/** Central, validated runtime configuration (read once from env). */
export const config = {
  port: Number(process.env.PORT || 3270),
  defaultOffice: process.env.DEFAULT_OFFICE || 'beirut-homes',
  // In production there is NO default PIN: without DASHBOARD_PIN the dashboard stays locked.
  dashboardPin: env('DASHBOARD_PIN') || (process.env.NODE_ENV === 'production' ? '' : '1234'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  demoMode: (process.env.DEMO_MODE ?? 'true') !== 'false',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/app.db'),
  llm: {
    provider: process.env.LLM_PROVIDER || 'auto',
    apiKey: env('ANTHROPIC_API_KEY').startsWith('sk-ant') ? env('ANTHROPIC_API_KEY') : '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    timeoutMs: 30000,
    retries: 1,
  },
  gemini: {
    // A Gemini key pasted into the ANTHROPIC_API_KEY box (anything not starting with sk-ant) is detected and used as Gemini.
    apiKey: env('GEMINI_API_KEY') || (env('ANTHROPIC_API_KEY') && !env('ANTHROPIC_API_KEY').startsWith('sk-ant') ? env('ANTHROPIC_API_KEY') : ''),
    models: (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite').split(',').map((m) => m.trim()).filter(Boolean),
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
};
