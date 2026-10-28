import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed by CORS')); } }));
app.use(express.json({ limit: '100kb' }));
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 }) : null;

app.get('/api/health', async (_req, res) => {
  if (!pool) return res.status(503).json({ ok: false, database: 'not_configured', message: 'Set DATABASE_URL in server/.env' });
  try { await pool.query('SELECT 1'); return res.json({ ok: true, database: 'connected' }); }
  catch { return res.status(503).json({ ok: false, database: 'unavailable' }); }
});

app.post('/api/surveys', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured. Please contact the survey team.' });
  const { surveyType, language, answers, consent } = req.body || {};
  if (!['farmer', 'stakeholder'].includes(surveyType)) return res.status(400).json({ error: 'Invalid survey type.' });
  if (!['en', 'hi'].includes(language)) return res.status(400).json({ error: 'Invalid language.' });
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ error: 'Survey answers are required.' });
  if (consent !== true) return res.status(400).json({ error: 'Consent is required to submit this survey.' });
  // A generated public receipt ID is not a sequential database ID and contains no personal information.
  const responseId = `HK-${new Date().toISOString().slice(0,10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    const result = await pool.query(
      'INSERT INTO survey_responses (response_id, survey_type, language, answers, consent) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING response_id, submitted_at',
      [responseId, surveyType, language, JSON.stringify(answers), true]
    );
    return res.status(201).json({ success: true, responseId: result.rows[0].response_id, submittedAt: result.rows[0].submitted_at, message: 'Survey submitted successfully.' });
  } catch (err) {
    console.error('Survey insert failed:', err.message);
    return res.status(500).json({ error: 'We could not save your response right now. Please try again.' });
  }
});

// Apply schema automatically on startup; the SQL file is safe to run repeatedly.
async function start() {
  if (pool) {
    try { const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8'); await pool.query(schema); console.log('PostgreSQL connected; survey schema ready.'); }
    catch (err) { console.error('Database initialization failed:', err.message); }
  } else console.warn('DATABASE_URL is missing. Survey submissions will not be saved until it is configured.');
  app.listen(PORT, () => console.log(`Khushhal Kisan Survey API listening on port ${PORT}`));
}
start();
