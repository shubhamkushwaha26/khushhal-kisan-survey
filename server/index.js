
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

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(value => value.trim());

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '100kb' }));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

function createResponseId() {
  return `HK-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function isValidDraftKey(key) {
  return typeof key === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
}

function isValidSurvey({ surveyType, language, answers }) {
  return (
    ['farmer', 'stakeholder'].includes(surveyType) &&
    ['en', 'hi'].includes(language) &&
    answers !== null &&
    typeof answers === 'object' &&
    !Array.isArray(answers)
  );
}

app.get('/api/health', async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      database: 'not_configured',
      message: 'Set DATABASE_URL in the server environment.'
    });
  }

  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true, database: 'connected' });
  } catch {
    return res.status(503).json({
      ok: false,
      database: 'unavailable'
    });
  }
});

// Get the unfinished draft for a browser's draft key.
app.get('/api/surveys/draft/:draftKey', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database is unavailable.' });
  }

  const { draftKey } = req.params;

  if (!isValidDraftKey(draftKey)) {
    return res.status(400).json({ error: 'Invalid draft key.' });
  }

  try {
    const result = await pool.query(
      `SELECT response_id, survey_type, language, answers,
              current_step, status, updated_at
       FROM survey_responses
       WHERE draft_key = $1
       LIMIT 1`,
      [draftKey]
    );

    if (!result.rowCount || result.rows[0].status !== 'draft') {
      return res.json({ success: true, draft: null });
    }

    return res.json({
      success: true,
      draft: result.rows[0]
    });
  } catch (err) {
    console.error('Draft retrieval failed:', err.message);
    return res.status(500).json({
      error: 'Could not retrieve the saved draft.'
    });
  }
});

// Save a new draft or update the existing unfinished draft.
app.post('/api/surveys/draft', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database is unavailable.' });
  }

  const {
    draftKey,
    surveyType,
    language,
    answers,
    currentStep
  } = req.body || {};

  if (!isValidDraftKey(draftKey)) {
    return res.status(400).json({ error: 'Invalid draft key.' });
  }

  if (!isValidSurvey({ surveyType, language, answers })) {
    return res.status(400).json({ error: 'Invalid survey data.' });
  }

  const step = Number.isInteger(currentStep) && currentStep >= 0
    ? currentStep
    : 0;

  try {
    const responseId = createResponseId();

    const result = await pool.query(
      `INSERT INTO survey_responses
         (response_id, draft_key, survey_type, language, answers,
          consent, status, current_step, submitted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb,
               FALSE, 'draft', $6, NULL, NOW())
       ON CONFLICT (draft_key) WHERE draft_key IS NOT NULL
       DO UPDATE SET
         survey_type = EXCLUDED.survey_type,
         language = EXCLUDED.language,
         answers = EXCLUDED.answers,
         current_step = EXCLUDED.current_step,
         updated_at = NOW()
       WHERE survey_responses.status = 'draft'
       RETURNING response_id, status, updated_at`,
      [
        responseId,
        draftKey,
        surveyType,
        language,
        JSON.stringify(answers),
        step
      ]
    );

    if (!result.rowCount) {
      const existing = await pool.query(
        `SELECT response_id, status
         FROM survey_responses
         WHERE draft_key = $1`,
        [draftKey]
      );

      return res.json({
        success: true,
        status: existing.rows[0]?.status || 'completed',
        responseId: existing.rows[0]?.response_id
      });
    }

    return res.json({
      success: true,
      status: result.rows[0].status,
      responseId: result.rows[0].response_id,
      updatedAt: result.rows[0].updated_at
    });
  } catch (err) {
    console.error('Draft save failed:', err.message);
    return res.status(500).json({
      error: 'Could not save the draft. Please retry.'
    });
  }
});

// Final submission: update the draft row instead of creating a second row.
app.post('/api/surveys', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is unavailable. Please contact the survey team.'
    });
  }

  const {
    draftKey,
    surveyType,
    language,
    answers,
    consent
  } = req.body || {};

  if (!isValidSurvey({ surveyType, language, answers })) {
    return res.status(400).json({ error: 'Invalid survey data.' });
  }

  if (consent !== true) {
    return res.status(400).json({
      error: 'Consent is required to submit this survey.'
    });
  }

  if (
    surveyType === 'farmer' &&
    (typeof answers.name !== 'string' || !answers.name.trim())
  ) {
    return res.status(400).json({
      error: 'Farmer name is required.'
    });
  }

  try {
    // New frontend sends a draftKey to make submission retry-safe.
    if (draftKey !== undefined) {
      if (!isValidDraftKey(draftKey)) {
        return res.status(400).json({ error: 'Invalid draft key.' });
      }

      // Lock the existing row so simultaneous retries cannot create duplicates.
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const existing = await client.query(
          `SELECT response_id, status, submitted_at
           FROM survey_responses
           WHERE draft_key = $1
           FOR UPDATE`,
          [draftKey]
        );

        if (
          existing.rowCount &&
          existing.rows[0].status === 'completed'
        ) {
          await client.query('COMMIT');

          return res.json({
            success: true,
            responseId: existing.rows[0].response_id,
            submittedAt: existing.rows[0].submitted_at,
            message: 'Survey was already submitted.'
          });
        }

        if (existing.rowCount) {
          const updated = await client.query(
            `UPDATE survey_responses
             SET survey_type = $2,
                 language = $3,
                 answers = $4::jsonb,
                 consent = TRUE,
                 status = 'completed',
                 submitted_at = NOW(),
                 updated_at = NOW()
             WHERE draft_key = $1
               AND status = 'draft'
             RETURNING response_id, submitted_at`,
            [
              draftKey,
              surveyType,
              language,
              JSON.stringify(answers)
            ]
          );

          if (updated.rowCount) {
            await client.query('COMMIT');

            return res.json({
              success: true,
              responseId: updated.rows[0].response_id,
              submittedAt: updated.rows[0].submitted_at,
              message: 'Survey submitted successfully.'
            });
          }
        }

        // No draft exists yet: create one completed row with this key.
        const inserted = await client.query(
          `INSERT INTO survey_responses
             (response_id, draft_key, survey_type, language, answers,
              consent, status, current_step, submitted_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb,
                   TRUE, 'completed', 0, NOW(), NOW())
           ON CONFLICT (draft_key) WHERE draft_key IS NOT NULL
           DO NOTHING
           RETURNING response_id, submitted_at`,
          [
            createResponseId(),
            draftKey,
            surveyType,
            language,
            JSON.stringify(answers)
          ]
        );

        if (inserted.rowCount) {
          await client.query('COMMIT');

          return res.json({
            success: true,
            responseId: inserted.rows[0].response_id,
            submittedAt: inserted.rows[0].submitted_at,
            message: 'Survey submitted successfully.'
          });
        }

        // A concurrent request won the insert; return its receipt.
        const completed = await client.query(
          `SELECT response_id, submitted_at, status
           FROM survey_responses
           WHERE draft_key = $1
           FOR UPDATE`,
          [draftKey]
        );

        await client.query('COMMIT');

        if (
          completed.rowCount &&
          completed.rows[0].status === 'completed'
        ) {
          return res.json({
            success: true,
            responseId: completed.rows[0].response_id,
            submittedAt: completed.rows[0].submitted_at,
            message: 'Survey was already submitted.'
          });
        }

        return res.status(409).json({
          error: 'Submission is already being processed. Please retry.'
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Compatibility with existing clients that do not send a draftKey.
    const result = await pool.query(
      `INSERT INTO survey_responses
         (response_id, survey_type, language, answers, consent,
          status, current_step, submitted_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, TRUE,
               'completed', 0, NOW(), NOW())
       RETURNING response_id, submitted_at`,
      [
        createResponseId(),
        surveyType,
        language,
        JSON.stringify(answers)
      ]
    );

    return res.status(201).json({
      success: true,
      responseId: result.rows[0].response_id,
      submittedAt: result.rows[0].submitted_at,
      message: 'Survey submitted successfully.'
    });
  } catch (err) {
    console.error('Survey submission failed:', err.message);
    return res.status(500).json({
      error: 'We could not save your response right now. Please try again.'
    });
  }
});

// Apply additive schema changes without deleting existing responses.
async function start() {
  if (pool) {
    try {
      const schema = await fs.readFile(
        path.join(__dirname, 'schema.sql'),
        'utf8'
      );

      await pool.query(schema);

      // Drafts have no submission timestamp until final submission.
      await pool.query(
        `ALTER TABLE survey_responses
         ALTER COLUMN submitted_at DROP NOT NULL`
      );

      await pool.query(
        `ALTER TABLE survey_responses
         ALTER COLUMN submitted_at DROP DEFAULT`
      );

      console.log('PostgreSQL connected; survey schema ready.');
    } catch (err) {
      console.error('Database initialization failed:', err.message);
    }
  } else {
    console.warn(
      'DATABASE_URL is missing. Survey submissions will not be saved.'
    );
  }

  app.listen(PORT, () => {
    console.log(`Khushhal Kisan Survey API listening on port ${PORT}`);
  });
}

start();
