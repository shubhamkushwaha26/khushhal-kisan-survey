
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(value => value.trim());

app.use(
  cors({
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
  })
);

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

// --------------------------------------------------
// QUESTION COLUMN MAPPING
// Column names must match server/schema.sql exactly.
// --------------------------------------------------

const QUESTION_COLUMNS = {
  name: 'name',
  mobile: 'mobile',
  email: 'email',
  whatsappGroup: 'whatsappGroup',
  location: 'location',
  age: 'age',
  experience: 'experience',
  land: 'land',
  crops: 'crops',
  landOwnership: 'landOwnership',

  topProblems: 'topProblems',
  seriousProblems: 'seriousProblems',
  financialLoss: 'financialLoss',
  diseaseExperience: 'diseaseExperience',
  infoSources: 'infoSources',
  infoGaps: 'infoGaps',
  seasonCost: 'seasonCost',

  smartphone: 'smartphone',
  appsUsed: 'appsUsed',
  photoDiagnosis: 'photoDiagnosis',
  digitalNeeds: 'digitalNeeds',
  language: 'languagePreference',
  trustFactors: 'trustFactors',
  digitalBarriers: 'digitalBarriers',

  useIntent: 'useIntent',
  paymentModel: 'paymentModel',
  willingnessToPay: 'willingnessToPay',
  paymentConditions: 'paymentConditions',

  pilot: 'pilot',
  recentProblem: 'recentProblem',
  timelyBenefit: 'timelyBenefit',
  paidServices: 'paidServices',
  trustEvidence: 'trustEvidence',
  firstProblem: 'firstProblem',
  recommend: 'recommend',
  referral: 'referral',

  farmersSupported: 'farmersSupported',
  stakeholderProblems: 'stakeholderProblems',
  guidanceProcess: 'guidanceProcess',
  stakeholderLoss: 'stakeholderLoss',
  digitalTools: 'digitalTools',
  valueCreation: 'valueCreation',
  pilotReadiness: 'pilotReadiness',
  adoptionNeeds: 'adoptionNeeds',
  sponsorship: 'sponsorship'
};

// These columns are JSONB in the question-wise schema.
const JSONB_QUESTION_KEYS = new Set([
  'seriousProblems',
  'infoSources',
  'digitalNeeds',
  'trustFactors',
  'digitalBarriers',
  'adoptionNeeds'
]);

// --------------------------------------------------
// COMMON HELPERS
// --------------------------------------------------

async function createResponseId(db = pool) {
  const result = await db.query(`
    SELECT 'KK-' || LPAD(
      nextval('public.survey_response_code_seq')::TEXT,
      6,
      '0'
    ) AS response_id
  `);

  return result.rows[0].response_id;
}

function createFarmerId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `HKF-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isValidDraftKey(key) {
  return (
    typeof key === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
  );
}

function isValidSurvey({ surveyType, language, answers }) {
  return (
    ['farmer', 'stakeholder'].includes(surveyType) &&
    ['en', 'hi', 'as'].includes(language) &&
    answers !== null &&
    typeof answers === 'object' &&
    !Array.isArray(answers)
  );
}

// Convert unanswered values to SQL NULL.
// Preserve arrays and their complete contents.
function normalizeAnswer(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned === '' ? null : cleaned;
  }

  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  return value;
}

function normalizeAnswers(answers) {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [key, normalizeAnswer(value)])
  );
}

function normalizeIndianMobile(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;
  return /^[6-9]\d{9}$/.test(national) ? national : null;
}

function getQuestionData(answers) {
  const columns = [];
  const values = [];
  const casts = [];

  for (const [answerKey, columnName] of Object.entries(QUESTION_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(answers, answerKey)) {
      continue;
    }

    const value = normalizeAnswer(answers[answerKey]);

    columns.push(`"${columnName}"`);

    if (JSONB_QUESTION_KEYS.has(answerKey)) {
      values.push(value === null ? null : JSON.stringify(value));
      casts.push('::jsonb');
    } else {
      // Blank or unanswered values are written as SQL NULL.
      values.push(
        value === null ? null :
          typeof value === 'string' ? value : JSON.stringify(value)
      );
      casts.push('');
    }
  }

  return { columns, values, casts };
}

function buildQuestionInsert(answers) {
  const data = getQuestionData(answers);

  return {
    columns: data.columns,
    values: data.values,
    casts: data.casts
  };
}

function buildQuestionUpdate(answers, firstParameterNumber) {
  const data = getQuestionData(answers);

  const assignments = data.columns.map((column, index) => {
    return `${column} = $${firstParameterNumber + index}${data.casts[index]}`;
  });

  return {
    assignments,
    values: data.values
  };
}

// --------------------------------------------------
// FARMER RECORD
// --------------------------------------------------

async function createFarmerRecord(client, answers) {
  const name = normalizeAnswer(answers.name);
  const location = normalizeAnswer(answers.location);

  const mobile = normalizeIndianMobile(answers.mobile);
  const email = normalizeAnswer(answers.email);

  const farmerId = createFarmerId();

  const result = await client.query(
    `INSERT INTO farmers
       (farmer_id, name, mobile, email, location)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, farmer_id`,
    [farmerId, name, mobile, email, location]
  );

  return result.rows[0];
}
// --------------------------------------------------
// ADMIN LOGIN
// --------------------------------------------------

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (
      !username ||
      !password ||
      !process.env.ADMIN_USERNAME ||
      !process.env.ADMIN_PASSWORD_HASH ||
      !process.env.JWT_SECRET
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid login details.'
      });
    }

    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      process.env.ADMIN_PASSWORD_HASH
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const token = jwt.sign(
      { role: 'admin', username },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      token,
      message: 'Admin login successful.'
    });

  } catch (err) {
    console.error('Admin login failed:', err.message);

    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// --------------------------------------------------
// VERIFY ADMIN LOGIN
// --------------------------------------------------

app.get('/api/admin/me', requireAdmin, (req, res) => {
  return res.json({
    success: true,
    username: req.admin.username,
    role: req.admin.role
  });
});
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Admin login required'
    });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired login token'
    });
  }
}
// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

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
  } catch (err) {
    console.error('Health check failed:', err.message);

    return res.status(503).json({
      ok: false,
      database: 'unavailable'
    });
  }
});

// --------------------------------------------------
// GET SAVED DRAFT
// --------------------------------------------------

app.get('/api/surveys/draft/:draftKey', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is unavailable.'
    });
  }

  const { draftKey } = req.params;

  if (!isValidDraftKey(draftKey)) {
    return res.status(400).json({
      error: 'Invalid draft key.'
    });
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
      return res.json({
        success: true,
        draft: null
      });
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

// --------------------------------------------------
// SAVE OR UPDATE DRAFT
// --------------------------------------------------

app.post('/api/surveys/draft', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is unavailable.'
    });
  }

  const {
    draftKey,
    surveyType,
    language,
    answers: rawAnswers,
    currentStep
  } = req.body || {};

  if (!isValidDraftKey(draftKey)) {
    return res.status(400).json({
      error: 'Invalid draft key.'
    });
  }

  if (!isValidSurvey({ surveyType, language, answers: rawAnswers })) {
    return res.status(400).json({
      error: 'Invalid survey data.'
    });
  }

  const answers = normalizeAnswers(rawAnswers);
  const step =
    Number.isInteger(currentStep) && currentStep >= 0
      ? currentStep
      : 0;

  try {
    const questionData = buildQuestionInsert(answers);

    const columns = [
      'response_id',
      'draft_key',
      'survey_type',
      'language',
      'answers',
      'consent',
      'status',
      'current_step',
      'submitted_at',
      'updated_at',
      ...questionData.columns
    ];

    const values = [
      await createResponseId(pool),
      draftKey,
      surveyType,
      language,
      JSON.stringify(answers),
      false,
      'draft',
      step,
      ...questionData.values
    ];

    const adjustedPlaceholders = questionData.values.map((_, index) => {
      const parameterNumber = 9 + index;
      const cast = questionData.casts[index];
      return `$${parameterNumber}${cast}`;
    });

    const finalPlaceholders = [
      '$1', '$2', '$3', '$4', '$5::jsonb',
      '$6', '$7', '$8', 'NULL', 'NOW()',
      ...adjustedPlaceholders
    ];

    const updateAssignments = [
      'survey_type = EXCLUDED.survey_type',
      'language = EXCLUDED.language',
      'answers = EXCLUDED.answers',
      'current_step = EXCLUDED.current_step',
      'updated_at = NOW()',
      ...questionData.columns.map(column => {
        return `${column} = EXCLUDED.${column}`;
      })
    ];

    const sql = `
      INSERT INTO survey_responses (${columns.join(', ')})
      VALUES (${finalPlaceholders.join(', ')})
      ON CONFLICT (draft_key) WHERE draft_key IS NOT NULL
      DO UPDATE SET ${updateAssignments.join(', ')}
      WHERE survey_responses.status = 'draft'
      RETURNING response_id, status, updated_at
    `;

    const result = await pool.query(sql, values);

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

// --------------------------------------------------
// SUBMIT SURVEY
// --------------------------------------------------

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
    answers: rawAnswers,
    consent
  } = req.body || {};

  if (!isValidSurvey({ surveyType, language, answers: rawAnswers })) {
    return res.status(400).json({
      error: 'Invalid survey data.'
    });
  }

  const answers = normalizeAnswers(rawAnswers);

  if (consent !== true) {
    return res.status(400).json({
      error: 'Consent is required to submit this survey.'
    });
  }

  if (typeof answers.name !== 'string' || !answers.name.trim()) {
    return res.status(400).json({
      error: 'Name is required.'
    });
  }

  const normalizedMobile = normalizeIndianMobile(answers.mobile);
  if (!normalizedMobile) {
    return res.status(400).json({
      error: 'A valid 10-digit Indian mobile number is required.'
    });
  }
  answers.mobile = normalizedMobile;

  if (!['Yes', 'No'].includes(answers.whatsappGroup)) {
    return res.status(400).json({
      error: 'Please select Yes or No for the WhatsApp group.'
    });
  }

  const email = normalizeAnswer(answers.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: 'Please enter a valid email address or leave it blank.'
    });
  }
  answers.email = email;

  if (draftKey !== undefined && !isValidDraftKey(draftKey)) {
    return res.status(400).json({
      error: 'Invalid draft key.'
    });
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return res.status(503).json({
      error: 'Database is temporarily unavailable. Please try again.'
    });
  }

  try {
    await client.query('BEGIN');

    // Check for an existing draft or completed submission.
    let existing = null;

    if (draftKey) {
      const result = await client.query(
        `SELECT response_id, status, submitted_at
         FROM survey_responses
         WHERE draft_key = $1
         FOR UPDATE`,
        [draftKey]
      );

      existing = result.rows[0] || null;
    }

    // Do not create another Farmer ID on a retry.
    if (existing && existing.status === 'completed') {
      await client.query('COMMIT');

      return res.json({
        success: true,
        responseId: existing.response_id,
        submittedAt: existing.submitted_at,
        message: 'Survey was already submitted.'
      });
    }

    // Generate a Farmer record only for a new farmer submission.
    let farmerRecord = null;

    if (surveyType === 'farmer') {
      farmerRecord = await createFarmerRecord(client, answers);
    }

    if (existing && existing.status === 'draft') {
      const assignments = [
        'survey_type = $2',
        'language = $3',
        'answers = $4::jsonb',
        'consent = TRUE',
        "status = 'completed'",
        'submitted_at = NOW()',
        'updated_at = NOW()'
      ];

      const values = [
        draftKey,
        surveyType,
        language,
        JSON.stringify(answers),
        farmerRecord?.id || null
      ];

      assignments.push('farmer_id = $5');

      const questionAssignments = buildQuestionUpdate(answers, 6);

      assignments.push(...questionAssignments.assignments);
      values.push(...questionAssignments.values);

      const updated = await client.query(
        `UPDATE survey_responses
         SET ${assignments.join(', ')}
         WHERE draft_key = $1
           AND status = 'draft'
         RETURNING response_id, submitted_at`,
        values
      );

      if (updated.rowCount) {
        await client.query('COMMIT');

        return res.json({
          success: true,
          responseId: updated.rows[0].response_id,
          farmerId: farmerRecord?.farmer_id || null,
          submittedAt: updated.rows[0].submitted_at,
          message: 'Survey submitted successfully.'
        });
      }
    }

    // New submission, or compatibility with clients without draftKey.
    const responseId = await createResponseId(client);

    const questionInsert = buildQuestionInsert(answers);

    const columns = [
      'response_id',
      'draft_key',
      'survey_type',
      'language',
      'answers',
      'consent',
      'status',
      'current_step',
      'submitted_at',
      'updated_at',
      'farmer_id',
      ...questionInsert.columns
    ];

    // Build parameter values and SQL placeholders in matching order.
    const finalValues = [
      responseId,
      draftKey || null,
      surveyType,
      language,
      JSON.stringify(answers),
      farmerRecord?.id || null,
      ...questionInsert.values
    ];

    const finalPlaceholders = [
      '$1',
      '$2',
      '$3',
      '$4',
      '$5::jsonb',
      'TRUE',
      "'completed'",
      '0',
      'NOW()',
      'NOW()',
      '$6',
      ...questionInsert.values.map((_, index) => {
        return `$${7 + index}${questionInsert.casts[index]}`;
      })
    ];

    let insertSql = `
      INSERT INTO survey_responses (${columns.join(', ')})
      VALUES (${finalPlaceholders.join(', ')})
      RETURNING response_id, submitted_at
    `;

    // If this request has a draft key, preserve duplicate protection.
    if (draftKey) {
      insertSql = `
        INSERT INTO survey_responses (${columns.join(', ')})
        VALUES (${finalPlaceholders.join(', ')})
        ON CONFLICT (draft_key) WHERE draft_key IS NOT NULL
        DO NOTHING
        RETURNING response_id, submitted_at
      `;
    }

    const inserted = await client.query(insertSql, finalValues);

    if (!inserted.rowCount && draftKey) {
      const completed = await client.query(
        `SELECT response_id, submitted_at, status
         FROM survey_responses
         WHERE draft_key = $1
         FOR UPDATE`,
        [draftKey]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        responseId: completed.rows[0]?.response_id,
        submittedAt: completed.rows[0]?.submitted_at,
        message: 'Survey was already submitted.'
      });
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      responseId: inserted.rows[0].response_id,
      farmerId: farmerRecord?.farmer_id || null,
      submittedAt: inserted.rows[0].submitted_at,
      message: 'Survey submitted successfully.'
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Transaction rollback failed:', rollbackError.message);
    }

    console.error('Survey submission failed:', err.message);

    return res.status(500).json({
      error: 'We could not save your response right now. Please try again.'
    });
  } finally {
    client?.release();
  }
});
// --------------------------------------------------
// ADMIN: GET ALL COMPLETED SURVEYS
// --------------------------------------------------

app.get('/api/admin/surveys', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable.'
    });
  }

  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
    100
  );

  const offset = Math.max(
    Number.parseInt(req.query.offset, 10) || 0,
    0
  );

  const surveyType = req.query.type;

  if (
    surveyType &&
    !['farmer', 'stakeholder'].includes(surveyType)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid survey type.'
    });
  }

  try {
    const values = [];
    let filter = "WHERE 1 = 1";

    if (surveyType) {
      values.push(surveyType);
      filter += ` AND survey_type = $${values.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM survey_responses
       ${filter}`,
      values
    );

    values.push(limit);
    values.push(offset);

    const result = await pool.query(
      `SELECT
         id,
         response_id,
         survey_type,
         language,
         status,
         answers,
         farmer_id,
         submitted_at,
         created_at
       FROM survey_responses
       ${filter}
       ORDER BY submitted_at DESC NULLS LAST, id DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values
    );

    return res.json({
      success: true,
      total: countResult.rows[0].total,
      limit,
      offset,
      surveys: result.rows
    });

  } catch (err) {
    console.error('Admin survey retrieval failed:', err.message);

    return res.status(500).json({
      success: false,
      message: 'Could not retrieve survey records.'
    });
  }
});
// --------------------------------------------------

// ADMIN EXCEL EXPORT
app.get('/api/admin/export-excel', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT response_id, survey_type, language, answers, submitted_at, created_at
      FROM survey_responses
      ORDER BY submitted_at DESC NULLS LAST
    `);

    const workbook = new ExcelJS.Workbook();

    for (const type of ['farmer', 'stakeholder']) {
      const rows = result.rows.filter(
        row => String(row.survey_type).toLowerCase() === type
      );
      const keys = [...new Set(rows.flatMap(row =>
        row.answers && typeof row.answers === 'object'
          ? Object.keys(row.answers) : []
      ))];

      const sheet = workbook.addWorksheet(
        type === 'farmer' ? 'Farmer Survey' : 'Stakeholder Survey'
      );

      sheet.addRow([
        'Response ID', 'Survey Type', 'Language', 'Submitted At', ...keys
      ]);
      sheet.getRow(1).font = { bold: true };

      for (const row of rows) {
        sheet.addRow([
          row.response_id,
          row.survey_type,
          row.language,
          row.submitted_at || row.created_at,
          ...keys.map(key => {
            const value = row.answers?.[key];
            return value == null ? '' :
              typeof value === 'object' ? JSON.stringify(value) : value;
          })
        ]);
      }

      sheet.columns.forEach((col, i) => {
        col.width = i < 4 ? 22 : 25;
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      'attachment; filename="Khushhal_Kisan_Survey_Data.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Excel export failed:', err.message);
    res.status(500).json({ success: false, message: 'Excel export failed.' });
  }
});

// ADMIN DASHBOARD SUMMARY
// --------------------------------------------------

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'completed'
        )::int AS total_submitted,
        COUNT(*) FILTER (
          WHERE status = 'draft'
        )::int AS total_drafts,
        COUNT(*) FILTER (
          WHERE status = 'completed' AND survey_type = 'farmer'
        )::int AS farmer_surveys,
        COUNT(*) FILTER (
          WHERE status = 'completed' AND survey_type = 'stakeholder'
        )::int AS stakeholder_surveys
      FROM survey_responses
    `);

    return res.json({
      success: true,
      summary: result.rows[0]
    });

  } catch (err) {
    console.error('Dashboard summary failed:', err.message);

    return res.status(500).json({
      success: false,
      message: 'Could not load dashboard summary.'
    });
  }
});
// --------------------------------------------------
// DATABASE INITIALIZATION
// --------------------------------------------------

async function start() {
  if (pool) {
    try {
      const schema = await fs.readFile(
        path.join(__dirname, 'schema.sql'),
        'utf8'
      );

      await pool.query(schema);

      // Drafts do not have a submission timestamp.
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





