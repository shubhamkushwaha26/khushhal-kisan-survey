import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
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
import { createSixSheetWorkbook, isValidPendingRow } from './lib/excel-export.js';

const { Pool } = pg;

// Prefer IPv4 for reliable Neon PostgreSQL connections.
setDefaultResultOrder('ipv4first');
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
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    }
  })
);

app.use(express.json({ limit: '8mb' }));

// DATABASE_URL is exclusively the NEW local survey database. All writes and
// migrations in this application use this pool only.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /sslmode=require/i.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'khushhal-kisan-new-survey'
    })
  : null;

// LEGACY_DATABASE_URL is strictly for old-data reads. PostgreSQL enforces
// read-only transactions on every connection, even if application code errs.
const legacyUrl = process.env.LEGACY_DATABASE_URL
  ? new URL(process.env.LEGACY_DATABASE_URL)
  : null;

// Neon is always connected using explicit verified TLS and read-only startup options.
const legacyPool = legacyUrl
  ? new Pool({
      host: legacyUrl.hostname,
      port: Number(legacyUrl.port || 5432),
      user: decodeURIComponent(legacyUrl.username),
      password: decodeURIComponent(legacyUrl.password),
      database: decodeURIComponent(legacyUrl.pathname.replace(/^\//, '')),
      ssl: { rejectUnauthorized: true },
      options: '-c default_transaction_read_only=on',
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      application_name: 'khushhal-kisan-legacy-readonly'
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
  sponsorship: 'sponsorship',
  address: 'address',
  satisfied_farming: 'satisfied_farming',
  children_farming: 'children_farming',
  farm_income: 'farm_income',
  irrigation_method: 'irrigation_method',
  irrigation_frequency: 'irrigation_frequency',
  irrigation_crop: 'irrigation_crop',
  irrigation_frequency_other: 'irrigation_frequency_other',
  field_location: 'field_location',
  crop_quality: 'crop_quality',
  low_quality_reasons: 'low_quality_reasons',
  low_quality_reasons_other: 'low_quality_reasons_other',
  soil_test: 'soil_test',
  soil_test_method: 'soil_test_method',
  fertilizer_quantity: 'fertilizer_quantity',
  fertilizer_type: 'fertilizer_type',
  fertilizer_type_other: 'fertilizer_type_other',
  culture_treatment: 'culture_treatment',
  farming_system: 'farming_system',
  farmer_crops: 'farmer_crops',
  pest_attack: 'pest_attack',
  recent_disease_group: 'recent_disease_group',
  recent_crop_name: 'recent_crop_name',
  recent_disease_name: 'recent_disease_name',
  disease_treatment: 'disease_treatment',
  sell_where: 'sell_where',
  selling_problems: 'selling_problems',
  desired_selling_solution: 'desired_selling_solution',
  crop_residue: 'crop_residue',
  mobile_solution: 'mobile_solution',
  ai_crop: 'ai_crop',
  ai_yield: 'ai_yield',
  ai_disease: 'ai_disease',
  ai_irrigation: 'ai_irrigation',
  ai_pest_risk: 'ai_pest_risk',
  ai_market: 'ai_market',
  ai_cost: 'ai_cost',
  soil_report_photo: 'soil_report_photo',
  disease_photo: 'disease_photo',
  fpo_name: 'fpo_name',
  contact_person: 'contact_person',
  fpo_role: 'fpo_role',
  fpo_district: 'fpo_district',
  fpo_years: 'fpo_years',
  fpo_member_count: 'fpo_member_count',
  fpo_activities: 'fpo_activities',
  fpo_activities_other: 'fpo_activities_other',
  fpo_crops: 'fpo_crops',
  fpo_farmer_problems: 'fpo_farmer_problems',
  fpo_farmer_problems_other: 'fpo_farmer_problems_other',
  fpo_disease_identification: 'fpo_disease_identification',
  fpo_support_challenge: 'fpo_support_challenge',
  fpo_digital_use: 'fpo_digital_use',
  fpo_digital_satisfaction: 'fpo_digital_satisfaction',
  fpo_digital_barriers: 'fpo_digital_barriers',
  fpo_top_modules: 'fpo_top_modules',
  fpo_app_interest: 'fpo_app_interest',
  fpo_support_needed: 'fpo_support_needed',
  fpo_training_ready: 'fpo_training_ready',
  fpo_partnership: 'fpo_partnership',
  fpo_partnership_other: 'fpo_partnership_other',
  fpo_improvement: 'fpo_improvement',
  fpo_recommend: 'fpo_recommend',
  fpo_followup: 'fpo_followup',
  fpo_crops_other: 'fpo_crops_other'
};

// These columns are JSONB in the question-wise schema.
const JSONB_QUESTION_KEYS = new Set([
  'seriousProblems',
  'infoSources',
  'digitalNeeds',
  'trustFactors',
  'digitalBarriers',
  'adoptionNeeds',
  'crop_residue',
  'desired_selling_solution',
  'disease_photo',
  'disease_treatment',
  'fertilizer_type',
  'fpo_activities',
  'fpo_digital_barriers',
  'fpo_disease_identification',
  'fpo_farmer_problems',
  'fpo_support_needed',
  'fpo_top_modules',
  'low_quality_reasons',
  'sell_where',
  'selling_problems',
  'soil_report_photo'
]);

// --------------------------------------------------
// COMMON HELPERS
// --------------------------------------------------

// New survey identifiers use an independent sequence. Historical KK/EKK IDs
// are never rewritten by this release.
async function createPendingId(db = pool) {
  const result = await db.query(`
    SELECT 'EKK-' || LPAD(nextval('public.survey_pending_new_code_seq')::TEXT, 6, '0') AS response_id
  `);
  return result.rows[0].response_id;
}

async function createResponseId(db = pool) {
  // One shared sequence across Farmer and FPO: AKK-00001, AKK-00002, ...
  // Historical KK/EKK identifiers remain unchanged.
  const result = await db.query(
    `SELECT 'AKK-' || LPAD(nextval('public.survey_akk_code_seq')::TEXT, 5, '0') AS response_id`
  );
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

const NEW_ANSWER_KEYS = {
  farmer: [
    'name','age','mobile','address','children_farming','farm_income','satisfied_farming','farmer_crops',
    'irrigation_method','irrigation_frequency','irrigation_frequency_other','irrigation_crop',
    'field_location','crop_quality','low_quality_reasons','low_quality_reasons_other','soil_test',
    'soil_test_method','soil_report_photo','fertilizer_quantity','fertilizer_type','fertilizer_type_other',
    'culture_treatment','farming_system','pest_attack','recent_crop_name','recent_disease_name',
    'disease_photo','disease_treatment','sell_where','selling_problems','desired_selling_solution',
    'crop_residue','mobile_solution','farmer_crops','ai_crop','ai_yield','ai_disease','ai_irrigation','ai_pest_risk',
    'ai_market','ai_cost'
  ],
  stakeholder: [
    'name','fpo_role','fpo_district','fpo_years','fpo_member_count','fpo_activities','fpo_activities_other',
    'fpo_crops','fpo_crops_other','fpo_farmer_problems','fpo_farmer_problems_other',
    'fpo_disease_identification','fpo_support_challenge','fpo_digital_use','fpo_digital_satisfaction',
    'fpo_digital_barriers','ai_crop','ai_yield','ai_disease','ai_irrigation','ai_pest_risk','ai_market','ai_cost',
    'fpo_top_modules','fpo_app_interest','fpo_support_needed','fpo_training_ready','fpo_partnership',
    'fpo_partnership_other','fpo_improvement','fpo_recommend','fpo_followup','fpo_name','contact_person',
    'mobile','email'
  ]
};

const QUESTION_TEXT_EN = {
  "name": "Farmer name",
  "age": "Age",
  "mobile": "Mobile number",
  "address": "Address",
  "satisfied_farming": "Are you satisfied with farming?",
  "children_farming": "Do you encourage your children to take up farming?",
  "farm_income": "Is your farming income sufficient to meet your family expenses?",
  "irrigation_method": "Which irrigation method do you use in your field?",
  "irrigation_frequency": "How many times do you irrigate your field?",
  "irrigation_crop": "Crop name",
  "irrigation_frequency_other": "Specify irrigation frequency",
  "field_location": "Where is your field located?",
  "crop_quality": "Is your crop produce of high quality?",
  "low_quality_reasons": "What causes low crop yield or poor quality?",
  "low_quality_reasons_other": "Specify reason",
  "soil_test": "Have you tested your field soil?",
  "soil_test_method": "How did you get your soil tested?",
  "fertilizer_quantity": "How much fertiliser do you use in your field? (Enter the quantity per acre) (Optional)",
  "fertilizer_type": "What type of fertiliser do you use in your field?",
  "fertilizer_type_other": "Specify fertiliser name",
  "culture_treatment": "Do you use culture-based treatments for pest control in your field? (e.g. earthworms, bacteria, Rhizobium, Phosphorus, etc.)",
  "farming_system": "Which farming system do you use?",
  "farmer_crops": "Which crops do you currently grow?",
  "pest_attack": "Do pests attack crops in your field?",
  "recent_disease_group": "Which disease recently affected your crop?",
  "recent_crop_name": "Crop name",
  "recent_disease_name": "Disease name",
  "disease_treatment": "What did you do to treat the disease?",
  "sell_where": "Where do you sell your crops?",
  "selling_problems": "What problems do you face while selling crops?",
  "desired_selling_solution": "What solution would you prefer for selling your produce?",
  "crop_residue": "What do you do with crop residue?",
  "mobile_solution": "Would you like solutions to all your farming problems on your mobile?",
  "ai_crop": "Crop Recommendation System",
  "ai_yield": "Crop Yield Prediction",
  "ai_disease": "Disease Detection",
  "ai_irrigation": "Irrigation Recommendation",
  "ai_pest_risk": "Pest & Disease Risk Forecast",
  "ai_market": "Market Price Prediction",
  "ai_cost": "Cost Optimization Engine",
  "soil_report_photo": "Photo upload",
  "disease_photo": "Photo upload",
  "fpo_name": "FPO name",
  "contact_person": "Contact person name",
  "fpo_role": "What is your position in your FPO?",
  "fpo_district": "In which district of Uttar Pradesh is your FPO registered?",
  "fpo_years": "How long has your FPO been operating?",
  "fpo_member_count": "How many farmer members are associated with your FPO?",
  "fpo_activities": "Which agricultural activities does your FPO mainly work in? (Select all that apply)",
  "fpo_activities_other": "Specify other activity",
  "fpo_crops": "Which crops do farmers associated with your FPO mainly grow?",
  "fpo_farmer_problems": "What major problems do farmers associated with your FPO face? (Select all that apply)",
  "fpo_farmer_problems_other": "Specify other problems",
  "fpo_disease_identification": "How do farmers currently identify crop diseases?",
  "fpo_support_challenge": "What is the biggest challenge your FPO faces in providing agricultural support to farmers?",
  "fpo_digital_use": "Does your FPO currently use any digital platform or mobile application to support farmers?",
  "fpo_digital_satisfaction": "How satisfied is your FPO with existing digital agriculture services?",
  "fpo_digital_barriers": "What difficulties do farmers face in adopting digital agriculture applications? (Select all that apply)",
  "fpo_top_modules": "Which three Khushhal Kisan modules would be most useful for farmers in your FPO? (Select up to 3)",
  "fpo_app_interest": "Is your FPO interested in adopting an AI-based farmer-support mobile application?",
  "fpo_support_needed": "What support would you need to implement this application in your FPO? (Select all that apply)",
  "fpo_training_ready": "Would your FPO be willing to organise farmer awareness and training programmes for Khushhal Kisan?",
  "fpo_partnership": "What type of partnership would your FPO prefer?",
  "fpo_partnership_other": "Specify other partnership model",
  "fpo_improvement": "In your opinion, what is the most important improvement needed in agricultural technology for farmers?",
  "fpo_recommend": "If the Khushhal Kisan pilot programme delivers positive results, would you recommend it to other FPOs?",
  "fpo_followup": "Would you like to be contacted about the Khushhal Kisan pilot programme?",
  "email": "Official email address (Optional)",
  "fpo_crops_other": "Other details"
};

function normalizeSurveyAnswers(surveyType, answers) {
  const keys = NEW_ANSWER_KEYS[surveyType] || [];
  const normalized = Object.fromEntries(keys.map(key => [key, normalizeAnswer(answers[key])]));
  // Preserve any future/extra metadata keys rather than silently discarding them.
  for (const [key, value] of Object.entries(answers)) {
    if (!Object.prototype.hasOwnProperty.call(normalized, key)) normalized[key] = normalizeAnswer(value);
  }
  return normalized;
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


async function syncSurveyAnswerRows(db, surveyResponseId, surveyType, answers) {
  const catalog = await db.query(
    `SELECT question_id FROM survey_question_catalog WHERE survey_type = $1`,
    [surveyType]
  );

  const validQuestionIds = new Set(catalog.rows.map(row => row.question_id));

  for (const [questionId, rawValue] of Object.entries(answers || {})) {
    if (!validQuestionIds.has(questionId)) continue;

    const value = normalizeAnswer(rawValue);

    if (value === null) {
      await db.query(
        `DELETE FROM survey_answers
         WHERE survey_response_id = $1 AND question_id = $2`,
        [surveyResponseId, questionId]
      );
    } else {
      await db.query(
        `INSERT INTO survey_answers
           (survey_response_id, question_id, answer_value)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (survey_response_id, question_id)
         DO UPDATE SET answer_value = EXCLUDED.answer_value, updated_at = NOW()`,
        [surveyResponseId, questionId, JSON.stringify(value)]
      );
    }
  }
}
function validateQuestionnaireAnswers(surveyType, answers) {
  const farmerRequired = [
    'name','age','mobile','address','children_farming','farm_income','satisfied_farming',
    'irrigation_method','irrigation_frequency','irrigation_crop','field_location','crop_quality',
    'soil_test','fertilizer_type','culture_treatment','farming_system','pest_attack',
    'recent_crop_name','recent_disease_name','disease_treatment','sell_where','selling_problems',
    'desired_selling_solution','crop_residue','mobile_solution','ai_crop','ai_yield','ai_disease',
    'ai_irrigation','ai_pest_risk','ai_market','ai_cost'
  ];
  const fpoRequired = [
    'fpo_role','fpo_district','fpo_years','fpo_member_count','fpo_activities','fpo_crops',
    'fpo_farmer_problems','fpo_disease_identification','fpo_support_challenge','fpo_digital_use',
    'fpo_digital_barriers','ai_crop','ai_yield','ai_disease','ai_irrigation','ai_pest_risk',
    'ai_market','ai_cost','fpo_top_modules','fpo_app_interest','fpo_support_needed',
    'fpo_training_ready','fpo_partnership','fpo_improvement','fpo_recommend','fpo_followup','contact_person','mobile'
  ];
  const required = surveyType === 'farmer' ? farmerRequired : fpoRequired;
  for (const key of required) {
    const value = answers[key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) return `à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤­à¥€ à¤†à¤µà¤¶à¥à¤¯à¤• à¤ªà¥à¤°à¤¶à¥à¤¨à¥‹à¤‚ à¤•à¤¾ à¤‰à¤¤à¥à¤¤à¤° à¤¦à¥‡à¤‚à¥¤ (${key})`;
  }
  if (surveyType === 'farmer' && answers.crop_quality === 'No' && !answers.low_quality_reasons?.length) {
    return 'à¤•à¥ƒà¤ªà¤¯à¤¾ à¤«à¤¸à¤² à¤•à¥€ à¤•à¤® à¤ªà¥ˆà¤¦à¤¾à¤µà¤¾à¤° à¤¯à¤¾ à¤–à¤°à¤¾à¤¬ à¤—à¥à¤£à¤µà¤¤à¥à¤¤à¤¾ à¤•à¤¾ à¤•à¤¾à¤°à¤£ à¤šà¥à¤¨à¥‡à¤‚à¥¤';
  }
  if (surveyType === 'farmer' && answers.soil_test === 'Yes' && !answers.soil_test_method) {
    return 'à¤•à¥ƒà¤ªà¤¯à¤¾ à¤®à¤¿à¤Ÿà¥à¤Ÿà¥€ à¤œà¤¾à¤à¤š à¤•à¤¾ à¤®à¤¾à¤§à¥à¤¯à¤® à¤šà¥à¤¨à¥‡à¤‚à¥¤';
  }
  if (surveyType === 'stakeholder' && ['Yes, regularly','Yes, occasionally'].includes(answers.fpo_digital_use) && !answers.fpo_digital_satisfaction) {
    return 'à¤•à¥ƒà¤ªà¤¯à¤¾ à¤®à¥Œà¤œà¥‚à¤¦à¤¾ à¤¡à¤¿à¤œà¤¿à¤Ÿà¤² à¤•à¥ƒà¤·à¤¿ à¤¸à¥‡à¤µà¤¾à¤“à¤‚ à¤•à¥‡ à¤ªà¥à¤°à¤¤à¤¿ à¤¸à¤‚à¤¤à¥à¤·à¥à¤Ÿà¤¿ à¤¬à¤¤à¤¾à¤à¤‚à¥¤';
  }
  const otherRules = [
    ['irrigation_frequency', 'Other'], ['low_quality_reasons', 'Other'], ['fertilizer_type', 'Other'],
    ['fpo_activities', 'Other agricultural activities'], ['fpo_crops', 'Other crops'],
    ['fpo_farmer_problems', 'Other problems'], ['fpo_partnership', 'Other partnership model']
  ];
  for (const [key, choice] of otherRules) {
    const value = answers[key];
    const selected = value === choice || (Array.isArray(value) && value.includes(choice));
    if (selected && !String(answers[`${key}_other`] || '').trim()) return 'à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤¨à¥à¤¯ à¤µà¤¿à¤•à¤²à¥à¤ª à¤•à¤¾ à¤µà¤¿à¤µà¤°à¤£ à¤²à¤¿à¤–à¥‡à¤‚à¥¤';
  }
  if (Array.isArray(answers.fpo_top_modules) && answers.fpo_top_modules.length > 3) {
    return 'FPO à¤•à¥‡ à¤ªà¥à¤°à¤¶à¥à¤¨ 13 à¤®à¥‡à¤‚ à¤…à¤§à¤¿à¤•à¤¤à¤® 3 à¤®à¥‰à¤¡à¥à¤¯à¥‚à¤² à¤šà¥à¤¨à¥‡à¤‚à¥¤';
  }
  for (const [key, value] of Object.entries(answers)) {
    if (!key.endsWith('_other')) continue;
    if (typeof value === 'string' && value.length > 1000) return 'à¤…à¤¨à¥à¤¯ à¤µà¤¿à¤•à¤²à¥à¤ª à¤•à¤¾ à¤µà¤¿à¤µà¤°à¤£ à¤¬à¤¹à¥à¤¤ à¤²à¤‚à¤¬à¤¾ à¤¹à¥ˆà¥¤';
  }
  for (const key of ['soil_report_photo', 'disease_photo']) {
    const photo = answers[key];
    if (photo && typeof photo === 'object' && photo.dataUrl) {
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl) || photo.dataUrl.length > 2500000) {
        return 'à¤«à¥‹à¤Ÿà¥‹ à¤•à¤¾ à¤ªà¥à¤°à¤¾à¤°à¥‚à¤ª à¤¯à¤¾ à¤†à¤•à¤¾à¤° à¤®à¤¾à¤¨à¥à¤¯ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤';
      }
    }
  }
  return null;
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

const adminLoginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

app.post('/api/admin/login', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const previous = adminLoginAttempts.get(clientIp);
  if (previous && now - previous.startedAt < LOGIN_WINDOW_MS && previous.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again after 15 minutes.'
    });
  }
  if (!previous || now - previous.startedAt >= LOGIN_WINDOW_MS) {
    adminLoginAttempts.set(clientIp, { startedAt: now, count: 0 });
  }

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
      adminLoginAttempts.get(clientIp).count += 1;
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
      adminLoginAttempts.get(clientIp).count += 1;
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    adminLoginAttempts.delete(clientIp);
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
    let legacy = 'not_configured';
    if (legacyPool) {
      try { await legacyPool.query('SELECT 1'); legacy = 'connected_read_only'; }
      catch (legacyError) { legacy = 'unavailable'; console.warn('Legacy read-only database unavailable:', legacyError.message); }
    }
    return res.json({ ok: true, database: 'connected', legacyDatabase: legacy });
  } catch (err) {
    console.error('Health check failed:', err.message);

    return res.status(503).json({
      ok: false,
      database: 'unavailable'
    });
  }
});

// --------------------------------------------------
// LOOK UP AN UNFINISHED FARMER DRAFT BY EXACT NAME + MOBILE
// --------------------------------------------------
app.post('/api/surveys/draft/lookup', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is unavailable.' });
  const name = String(req.body?.name || '').trim();
  const mobile = normalizeIndianMobile(req.body?.mobile);
  const surveyType = req.body?.surveyType || 'farmer';
  const surveyVersion = req.body?.surveyVersion === 'legacy' ? 'legacy' : 'new';
  if (!['farmer', 'stakeholder'].includes(surveyType)) {
    return res.status(400).json({ error: 'Invalid survey type.' });
  }
  if (!name || !mobile) return res.status(400).json({ error: 'Name and valid mobile are required.' });
  try {
    const result = await pool.query(
      `SELECT draft_key, response_id, survey_type, language, answers, current_step, updated_at
       FROM survey_responses
       WHERE status = 'draft' AND survey_type = $3
         AND COALESCE(survey_version, 'legacy') = $4
         AND LOWER(BTRIM(COALESCE(name, answers->>'name', answers->>'contact_person', answers->>'fpo_name', ''))) = LOWER($1)
         AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(mobile), ''), NULLIF(BTRIM(answers->>'mobile'), ''), ''), '[^0-9]', '', 'g'), 10) = $2
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [name, mobile, surveyType, surveyVersion]
    );
    return res.json({ success: true, draft: result.rows[0] || null });
  } catch (err) {
    console.error('Draft identity lookup failed:', err.message);
    return res.status(500).json({ error: 'Could not check for a saved draft.' });
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
    surveyVersion = 'new',
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

  if (!['new', 'legacy'].includes(surveyVersion)) return res.status(400).json({ error: 'Invalid survey version.' });
  const answers = normalizeSurveyAnswers(surveyType, rawAnswers);
  // FPO drafts use contact_person; farmer drafts use name.
  answers.name = String(answers.name || answers.contact_person || answers.fpo_name || '').trim();
  const draftMobile = normalizeIndianMobile(answers.mobile);
  if (!answers.name || !draftMobile) {
    return res.json({ success: true, saved: false, reason: 'contact_required' });
  }
  answers.mobile = draftMobile;
  const step =
    Number.isInteger(currentStep) && currentStep >= 0
      ? currentStep
      : 0;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Reuse the same response ID for every autosave of this draft.
    // This prevents the serial sequence from skipping a number on each keystroke.
    const existingDraft = await client.query(
      `SELECT response_id
       FROM survey_responses
       WHERE draft_key = $1 AND status = 'draft' AND COALESCE(survey_version, 'legacy') = $2
       LIMIT 1`,
      [draftKey, surveyVersion]
    );
    const draftResponseId =
      existingDraft.rows[0]?.response_id || await createPendingId(client);

    const questionData = buildQuestionInsert(answers);

    const columns = [
      'response_id',
      'draft_key',
      'survey_type',
      'survey_version',
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
      draftResponseId,
      draftKey,
      surveyType,
      surveyVersion,
      language,
      JSON.stringify(answers),
      false,
      'draft',
      step,
      ...questionData.values
    ];

    const adjustedPlaceholders = questionData.values.map((_, index) => {
      const parameterNumber = 10 + index;
      const cast = questionData.casts[index];
      return `$${parameterNumber}${cast}`;
    });

    const finalPlaceholders = [
      '$1', '$2', '$3', '$4', '$5', '$6::jsonb',
      '$7', '$8', '$9', 'NULL', 'NOW()',
      ...adjustedPlaceholders
    ];

    const updateAssignments = [
      'survey_type = EXCLUDED.survey_type',
      'survey_version = EXCLUDED.survey_version',
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
      RETURNING id, response_id, status, updated_at
    `;

    const result = await client.query(sql, values);

    if (!result.rowCount) {
      const existing = await client.query(
        `SELECT response_id, status
         FROM survey_responses
         WHERE draft_key = $1`,
        [draftKey]
      );

      await client.query('COMMIT');
      return res.json({
        success: true,
        status: existing.rows[0]?.status || 'completed',
        responseId: existing.rows[0]?.response_id
      });
    }

    await syncSurveyAnswerRows(client, result.rows[0].id, surveyType, answers);
    await client.query('COMMIT');

    return res.json({
      success: true,
      status: result.rows[0].status,
      responseId: result.rows[0].response_id,
      updatedAt: result.rows[0].updated_at
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Draft rollback failed:', rollbackError.message);
      }
    }

    console.error('Draft save failed:', err.message);

    return res.status(500).json({
      error: 'Could not save the draft. Please retry.'
    });
  } finally {
    if (client) client.release();
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
    surveyVersion = 'new',
    language,
    answers: rawAnswers,
    consent
  } = req.body || {};

  if (!isValidSurvey({ surveyType, language, answers: rawAnswers })) {
    return res.status(400).json({
      error: 'Invalid survey data.'
    });
  }

  if (surveyVersion !== 'new') return res.status(400).json({ error: 'Only the current questionnaire can be submitted from this form.' });
  const answers = normalizeSurveyAnswers(surveyType, rawAnswers);
  answers.name = String(answers.name || answers.contact_person || answers.fpo_name || '').trim();

  if (consent !== true) {
    return res.status(400).json({
      error: 'Consent is required to submit this survey.'
    });
  }

  const questionnaireError = validateQuestionnaireAnswers(surveyType, answers);
  if (questionnaireError) return res.status(400).json({ error: questionnaireError });

  if (surveyType === 'farmer' && !answers.name) {
    return res.status(400).json({ error: 'Farmer name is required.' });
  }

  const normalizedMobile = normalizeIndianMobile(answers.mobile);
  if (surveyType === 'farmer' && !normalizedMobile) {
    return res.status(400).json({ error: 'A valid 10-digit Indian mobile number is required.' });
  }
  if (answers.mobile && !normalizedMobile) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }
  answers.mobile = normalizedMobile;

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
        `SELECT id, response_id, status, submitted_at
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
        "survey_version = 'new'",
        'response_id = $6',
        'legacy_response_id = $7',
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
        farmerRecord?.id || null,
        await createResponseId(client, surveyType),
        existing.response_id
      ];

      assignments.push('farmer_id = $5');

      const questionAssignments = buildQuestionUpdate(answers, 8);

      assignments.push(...questionAssignments.assignments);
      values.push(...questionAssignments.values);

      const updated = await client.query(
        `UPDATE survey_responses
         SET ${assignments.join(', ')}
         WHERE draft_key = $1
           AND status = 'draft'
         RETURNING id, response_id, submitted_at`,
        values
      );

      if (updated.rowCount) {
        await syncSurveyAnswerRows(client, updated.rows[0].id, surveyType, answers);
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
    const responseId = await createResponseId(client, surveyType);

    const questionInsert = buildQuestionInsert(answers);

    const columns = [
      'response_id',
      'draft_key',
      'survey_type',
      'survey_version',
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
      'new',
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
      '$5',
      '$6::jsonb',
      'TRUE',
      "'completed'",
      '0',
      'NOW()',
      'NOW()',
      '$7',
      ...questionInsert.values.map((_, index) => {
        return `$${8 + index}${questionInsert.casts[index]}`;
      })
    ];

    let insertSql = `
      INSERT INTO survey_responses (${columns.join(', ')})
      VALUES (${finalPlaceholders.join(', ')})
      RETURNING id, response_id, submitted_at
    `;

    // If this request has a draft key, preserve duplicate protection.
    if (draftKey) {
      insertSql = `
        INSERT INTO survey_responses (${columns.join(', ')})
        VALUES (${finalPlaceholders.join(', ')})
        ON CONFLICT (draft_key) WHERE draft_key IS NOT NULL
        DO NOTHING
        RETURNING id, response_id, submitted_at
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

    await syncSurveyAnswerRows(client, inserted.rows[0].id, surveyType, answers);
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
  if (!pool) return res.status(503).json({ success: false, message: 'New local database unavailable.' });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const surveyType = req.query.type;
  if (surveyType && !['farmer', 'stakeholder'].includes(surveyType)) {
    return res.status(400).json({ success: false, message: 'Invalid survey type.' });
  }
  try {
    const localResult = await pool.query(`
      SELECT id, response_id, legacy_response_id, survey_type, survey_version,
             language, status, answers, farmer_id, name, mobile,
             COALESCE(location, answers->>'address', answers->>'fpo_district') AS location,
             submitted_at, created_at
      FROM survey_responses
      WHERE status = 'completed' AND COALESCE(survey_version, 'new') = 'new'
      ${surveyType ? 'AND survey_type = $1' : ''}
      ORDER BY submitted_at DESC NULLS LAST, id DESC
    `, surveyType ? [surveyType] : []);
    const localRows = localResult.rows.map(row => ({ ...row, source: 'New (Local)' }));

    let oldRows = [];
    let oldDataUnavailable = false;
    let oldDataMessage = '';
    if (legacyPool) {
      try {
        // SELECT only. The connection itself is PostgreSQL read-only enforced.
        const oldResult = await legacyPool.query('SELECT * FROM survey_responses');
        oldRows = oldResult.rows
          .filter(row => row.status === 'completed' && (!surveyType || (surveyType === 'stakeholder' ? ['stakeholder','fpo'].includes(row.survey_type) : row.survey_type === surveyType)))
          .map(row => {
            let answers = row.answers || {};
            if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = {}; } }
            if (!answers || typeof answers !== 'object' || Array.isArray(answers)) answers = {};
            for (const [key, column] of Object.entries(QUESTION_COLUMNS)) {
              if (answers[key] === undefined && row[column] !== undefined && row[column] !== null) answers[key] = row[column];
            }
            return {
              ...row,
              answers,
              response_id: row.response_id || row.survey_id || row.id,
              legacy_response_id: row.legacy_response_id || null,
              survey_version: 'legacy',
              status: 'completed',
              location: row.location || row.address || answers.address || answers.fpo_district || '',
              submitted_at: row.submitted_at || row.created_at || null,
              source: 'Old (Neon)'
            };
          });
      } catch (legacyError) {
        oldDataUnavailable = true;
        oldDataMessage = 'Old Neon records are currently unavailable. Local survey service is still running.';
        console.warn('Legacy admin records unavailable:', legacyError.message);
      }
    } else {
      oldDataUnavailable = true;
      oldDataMessage = 'LEGACY_DATABASE_URL is not configured; old Neon records are unavailable.';
    }
    const allRows = [...localRows, ...oldRows].sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
    return res.json({
      success: true,
      total: allRows.length,
      limit,
      offset,
      oldDataUnavailable,
      oldDataMessage,
      surveys: allRows.slice(offset, offset + limit)
    });
  } catch (err) {
    console.error('Admin survey retrieval failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not retrieve survey records.' });
  }
});
// --------------------------------------------------

// --------------------------------------------------
// ADMIN: PENDING (farmers who started but did not submit)
// --------------------------------------------------
app.get('/api/admin/enquiries', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({ success: false, message: 'Database unavailable.' });
  }

  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const surveyType = String(req.query.type || 'farmer');
  if (!['farmer', 'stakeholder'].includes(surveyType)) {
    return res.status(400).json({ success: false, message: 'Invalid survey type.' });
  }

  const where = `
    WHERE status = 'draft'
      AND COALESCE(survey_version, 'new') = 'new'
      AND survey_type = $1
      AND COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(answers->>'name'), ''), NULLIF(BTRIM(answers->>'contact_person'), ''), NULLIF(BTRIM(answers->>'fpo_name'), '')) IS NOT NULL
      AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(mobile), ''), NULLIF(BTRIM(answers->>'mobile'), ''), ''), '[^0-9]', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
  `;
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM survey_responses ${where}`,
      [surveyType]
    );
    const result = await pool.query(
      `SELECT id, response_id, legacy_response_id, survey_type, survey_version, language, status, answers,
              name, mobile, COALESCE(location, answers->>'address', answers->>'fpo_district') AS location,
              current_step, created_at, updated_at
       FROM survey_responses ${where}
       ORDER BY updated_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [surveyType, limit, offset]
    );

    return res.json({
      success: true,
      total: countResult.rows[0].total,
      limit,
      offset,
      pending: result.rows
    });
  } catch (err) {
    console.error('Admin pending retrieval failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not retrieve pending drafts.' });
  }
});

// --------------------------------------------------

function excelLabel(key, lang) {
  const labels = {
    name: ['\u0928\u093e\u092e', '\u09a8\u09be\u09ae'],
    mobile: ['\u092e\u094b\u092c\u093e\u0907\u0932 \u0928\u0902\u092c\u0930', '\u09ae\u09cb\u09ac\u09be\u0987\u09b2 \u09a8\u09ae\u09cd\u09ac\u09f0'],
    location: ['\u0917\u093e\u0902\u0935 / \u0938\u094d\u0925\u093e\u0928', '\u0997\u09be\u0981\u0993 / \u09b8\u09cd\u09a5\u09be\u09a8'],
    age: ['\u0906\u092f\u0941', '\u09ac\u09df\u09b8'],
    experience: ['\u0916\u0947\u0924\u0940 \u0915\u093e \u0905\u0928\u0941\u092d\u0935', '\u0995\u09c3\u09b7\u09bf\u0995\u09be\u09b0\u09cd\u09af\u09f0 \u0985\u09ad\u09bf\u099c\u09cd\u099e\u09a4\u09be'],
    land: ['\u091c\u092e\u0940\u0928 \u0915\u093e \u0930\u0915\u092c\u093e', '\u09ad\u09c2\u09ae\u09bf\u09f0 \u09aa\u09f0\u09bf\u09ae\u09be\u09a3'],
    crops: ['\u092e\u0941\u0916\u094d\u092f \u092b\u0938\u0932\u0947\u0902', '\u09aa\u09cd\u09f0\u09a7\u09be\u09a8 \u09ab\u09b8\u09b2'],
    landOwnership: ['\u092d\u0942\u092e\u093f \u0915\u093e \u0938\u094d\u0935\u093e\u092e\u093f\u0924\u094d\u0935', '\u09ad\u09c2\u09ae\u09bf\u09f0 \u09ae\u09be\u09b2\u09bf\u0995\u09c0\u09b8\u09cd\u09ac\u09a4\u09cd\u09ac'],
    topProblems: ['\u092e\u0941\u0916\u094d\u092f \u0938\u092e\u0938\u094d\u092f\u093e\u090f\u0902', '\u09aa\u09cd\u09f0\u09a7\u09be\u09a8 \u09b8\u09ae\u09b8\u09cd\u09af\u09be'],
    seriousProblems: ['\u0917\u0902\u092d\u0940\u0930 \u0938\u092e\u0938\u094d\u092f\u093e\u090f\u0902', '\u0997\u09c1\u09f0\u09c1\u09a4\u09cd\u09ac\u09aa\u09c2\u09f0\u09cd\u09a3 \u09b8\u09ae\u09b8\u09cd\u09af\u09be'],
    financialLoss: ['\u0906\u0930\u094d\u0925\u093f\u0915 \u0928\u0941\u0915\u0938\u093e\u0928', '\u0986\u09f0\u09cd\u09a5\u09bf\u0995 \u0995\u09cd\u09b7\u09a4\u09bf'],
    diseaseExperience: ['\u092b\u0938\u0932 \u0930\u094b\u0917 \u0915\u093e \u0905\u0928\u0941\u092d\u0935', '\u09ab\u09b8\u09b2\u09f0 \u09f0\u09cb\u0997\u09f0 \u0985\u09ad\u09bf\u099c\u09cd\u099e\u09a4\u09be'],
    infoSources: ['\u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u0915\u0947 \u0938\u094d\u0930\u094b\u0924', '\u09a4\u09a5\u09cd\u09af\u09f0 \u0989\u09ce\u09b8'],
    smartphone: ['\u0938\u094d\u092e\u093e\u0930\u094d\u091f\u092b\u094b\u0928 \u0915\u0940 \u0909\u092a\u0932\u092c\u094d\u0927\u0924\u093e', '\u09b8\u09cd\u09ae\u09be\u09f0\u09cd\u099f\u09ab\u09cb\u09a8\u09f0 \u0989\u09aa\u09b2\u09ac\u09cd\u09a7\u09a4\u09be'],
    languagePreference: ['\u092d\u093e\u0937\u093e \u0915\u0940 \u092a\u0938\u0902\u0926', '\u09ad\u09be\u09b7\u09be\u09f0 \u09aa\u099b\u09a8\u09cd\u09a6'],
    whatsappGroup: ['WhatsApp \u0917\u094d\u0930\u0941\u092a \u0938\u0947 \u091c\u0941\u0921\u093c\u0928\u093e', 'WhatsApp \u0997\u09cd\u09f0\u09c1\u09aa\u09a4 \u09af\u09cb\u0997\u09a6\u09be\u09a8'],
    farmersSupported: ['\u0938\u0939\u093e\u092f\u0924\u093e \u092a\u093e\u0928\u0947 \u0935\u093e\u0932\u0947 \u0915\u093f\u0938\u093e\u0928', '\u09b8\u09b9\u09be\u09af\u09bc \u09aa\u09cb\u09f1\u09be \u0995\u09c3\u09b7\u0995'],
    stakeholderProblems: ['\u0939\u093f\u0924\u0927\u093e\u0930\u0915 \u0915\u0940 \u0938\u092e\u0938\u094d\u092f\u093e\u090f\u0902', '\u0985\u0982\u09b6\u09c0\u09a6\u09be\u09f0\u09f0 \u09b8\u09ae\u09b8\u09cd\u09af\u09be']
  };

  if (lang === 'en') return key;
  return labels[key]?.[lang === 'as' ? 1 : 0] ||
    key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// ADMIN EXCEL EXPORT: exactly six source-separated sheets.
app.get('/api/admin/export-excel', requireAdmin, async (_req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'New local database unavailable.' });
    const local = await pool.query(`
      SELECT id, response_id, legacy_response_id, survey_type, language, status, answers,
             COALESCE(name, answers->>'name', answers->>'contact_person', answers->>'fpo_name', '') AS name,
             COALESCE(mobile, answers->>'mobile', '') AS mobile,
             COALESCE(location, answers->>'address', answers->>'fpo_district', '') AS address,
             created_at, submitted_at, updated_at
      FROM survey_responses
      WHERE COALESCE(survey_version, 'new') = 'new'
      ORDER BY id ASC
    `);
    const completed = local.rows.filter(r => r.status === 'completed');
    const pending = local.rows.filter(r => r.status === 'draft' && isValidPendingRow(r));
    let legacyRows = [];
    let legacyQuestionLabels = {};
    if (legacyPool) {
      const legacy = await legacyPool.query('SELECT * FROM survey_responses');
      legacyRows = legacy.rows.filter(r => r.status === 'completed');
      try {
        const oldCatalog = await legacyPool.query(`SELECT survey_type, question_id, question_text_hi, question_text_en, question_text_as FROM survey_question_catalog`);
        for (const item of oldCatalog.rows) legacyQuestionLabels[`${item.survey_type}:${item.question_id}`] = item;
      } catch (catalogError) {
        console.warn('Historical question labels are not available in Neon metadata:', catalogError.message);
      }
    }
    const catalog = JSON.parse(await fs.readFile(path.join(__dirname, 'config', 'question-catalog.json'), 'utf8'));
    const workbook = await createSixSheetWorkbook({ localRows: local.rows, legacyRows, currentCatalog: catalog, legacyQuestionLabels });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Khushhal_Kisan_6_Sheets.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Six-sheet Excel export failed:', err.message);
    res.status(500).json({ success: false, message: 'Excel export failed.' });
  }
});

// ADMIN DASHBOARD SUMMARY
// --------------------------------------------------

app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'New local database unavailable.' });
    const localResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='completed' AND survey_type='farmer')::int AS new_farmer,
        COUNT(*) FILTER (WHERE status='completed' AND survey_type='stakeholder')::int AS new_fpo,
        COUNT(*) FILTER (WHERE status='draft' AND survey_type='farmer'
          AND COALESCE(NULLIF(BTRIM(name),''),NULLIF(BTRIM(answers->>'name'),''),NULLIF(BTRIM(answers->>'contact_person'),''),NULLIF(BTRIM(answers->>'fpo_name'),'')) IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(mobile),''),NULLIF(BTRIM(answers->>'mobile'),''),''),'[^0-9]','','g'),10) ~ '^[6-9][0-9]{9}$')::int AS pending_farmer,
        COUNT(*) FILTER (WHERE status='draft' AND survey_type='stakeholder'
          AND COALESCE(NULLIF(BTRIM(name),''),NULLIF(BTRIM(answers->>'name'),''),NULLIF(BTRIM(answers->>'contact_person'),''),NULLIF(BTRIM(answers->>'fpo_name'),'')) IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(mobile),''),NULLIF(BTRIM(answers->>'mobile'),''),''),'[^0-9]','','g'),10) ~ '^[6-9][0-9]{9}$')::int AS pending_fpo
      FROM survey_responses WHERE COALESCE(survey_version,'new')='new'
    `);
    const counts = { ...localResult.rows[0], old_farmer: 0, old_fpo: 0 };
    let oldDataUnavailable = !legacyPool;
    let oldDataMessage = legacyPool ? '' : 'LEGACY_DATABASE_URL is not configured; old Neon records are unavailable.';
    if (legacyPool) {
      try {
        const old = await legacyPool.query('SELECT * FROM survey_responses');
        for (const row of old.rows) {
          if (row.status !== 'completed') continue;
          if (row.survey_type === 'farmer') counts.old_farmer++;
          if (['stakeholder','fpo'].includes(row.survey_type)) counts.old_fpo++;
        }
      } catch (err) {
        oldDataUnavailable = true;
        oldDataMessage = 'Old Neon records are currently unavailable. Local survey service remains available.';
        console.warn('Legacy dashboard counts unavailable:', err.message);
      }
    }
    return res.json({ success: true, oldDataUnavailable, oldDataMessage, summary: {
      ...counts,
      total_submitted: counts.new_farmer + counts.new_fpo + counts.old_farmer + counts.old_fpo,
      new_submitted: counts.new_farmer + counts.new_fpo,
      old_submitted: counts.old_farmer + counts.old_fpo,
      pending_stakeholder: counts.pending_fpo,
      total_pending: counts.pending_farmer + counts.pending_fpo,
      total_enquiries: counts.pending_farmer + counts.pending_fpo,
      farmer_surveys: counts.new_farmer + counts.old_farmer,
      stakeholder_surveys: counts.new_fpo + counts.old_fpo
    }});
  } catch (err) {
    console.error('Dashboard summary failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load dashboard summary.' });
  }
});
// --------------------------------------------------
// DATABASE INITIALIZATION
// --------------------------------------------------

// Additive migration only: mark all rows that existed before the new form as
// legacy, and create independent current-version ID sequences. No historical response_id
// values, answers, timestamps, or rows are modified.
async function migrateSurveyVersions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_version VARCHAR(20) NOT NULL DEFAULT 'legacy'`);
    await client.query(`UPDATE survey_responses SET survey_version = 'legacy' WHERE survey_version IS NULL`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS public.survey_pending_new_code_seq START WITH 1 INCREMENT BY 1`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_survey_responses_version_type_status ON survey_responses (survey_version, survey_type, status)`);
    await client.query('COMMIT');
    console.log('Survey version migration ready; historical records and IDs preserved.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


async function alignNewIdSequenceWithLegacy() {
  if (!pool || !legacyPool) {
    throw new Error('Both local and read-only Neon database connections are required for KK ID alignment.');
  }

  const legacyMax = await legacyPool.query(`
    SELECT COALESCE(MAX((substring(response_id from '^KK-([0-9]+)$'))::BIGINT), 0) AS max_id
    FROM survey_responses
    WHERE response_id ~ '^KK-[0-9]+$'
  `);

  const localMax = await pool.query(`
    SELECT COALESCE(MAX((substring(response_id from '^KK-([0-9]+)$'))::BIGINT), 0) AS max_id
    FROM survey_responses
    WHERE response_id ~ '^KK-[0-9]+$'
  `);

  const state = await pool.query(
    `SELECT last_value, is_called FROM public.survey_kk_code_seq`
  );

  const nextFromSequence = state.rows[0].is_called
    ? Number(state.rows[0].last_value) + 1
    : Number(state.rows[0].last_value);

  const nextId = Math.max(
    Number(legacyMax.rows[0].max_id) + 1,
    Number(localMax.rows[0].max_id) + 1,
    nextFromSequence,
    1
  );

  await pool.query(
    `SELECT setval('public.survey_kk_code_seq', $1, false)`,
    [nextId]
  );

  console.log(`New local KK sequence aligned to ${nextId}; Neon remains read-only.`);
}

async function start() {
  if (pool) {
    try {
      const localIdentity = await pool.query('SELECT current_database() AS database_name');
      if (localIdentity.rows[0]?.database_name !== 'khushhal_kisan_survey_new') {
        throw new Error(`DATABASE_URL must point only to khushhal_kisan_survey_new (connected: ${localIdentity.rows[0]?.database_name || 'unknown'}).`);
      }
      if (process.env.RUN_MIGRATIONS === 'true') {
        const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
        await pool.query(schema);

        const questionMigration = await fs.readFile(
          path.join(__dirname, 'migrations', '002_current_question_columns.sql'),
          'utf8'
        );
        await pool.query(questionMigration);

        const kkIdMigration = await fs.readFile(
          path.join(__dirname, 'migrations', '003_shared_kk_ids.sql'),
          'utf8'
        );
        await pool.query(kkIdMigration);

        await pool.query(`ALTER TABLE survey_responses ALTER COLUMN submitted_at DROP NOT NULL`);
        await pool.query(`ALTER TABLE survey_responses ALTER COLUMN submitted_at DROP DEFAULT`);
        await migrateSurveyVersions();
        console.log('Explicit additive migrations completed.');
      } else {
        // Production-safe default: connecting to the database never changes its schema.
        console.log('PostgreSQL connected; automatic migrations are disabled.');
      }
    } catch (err) {
      console.error('Database initialization failed; API will not start:', err.message);
      await pool.end().catch(() => {});
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn(
      'DATABASE_URL is missing. Survey submissions will not be saved.'
    );
  }

  if (legacyPool) {
    let legacyVerified = false;
    try {
      const legacyIdentity = await legacyPool.query(`
        SELECT current_database() AS database_name,
               current_setting('transaction_read_only') AS read_only,
               current_setting('default_transaction_read_only') AS default_read_only
      `);

      if (legacyIdentity.rows[0]?.database_name !== 'neondb') {
        throw new Error('LEGACY_DATABASE_URL must point to Neon neondb.');
      }
      if (
        legacyIdentity.rows[0]?.read_only !== 'on' ||
        legacyIdentity.rows[0]?.default_read_only !== 'on'
      ) {
        throw new Error('Neon read-only verification failed; legacy access is disabled.');
      }

      legacyVerified = true;
      console.log('Neon connected: TLS verified, session read-only enforced.');
    } catch (err) {
      console.warn('Neon verification failed; local survey remains online:', err.message);
    }

    // Sequence alignment is allowed only after successful Neon read-only verification.
    if (legacyVerified) {
      await alignNewIdSequenceWithLegacy();
    } else {
      throw new Error('Neon read-only verification failed. API startup blocked to prevent duplicate KK IDs.');
    }
  } else {
    throw new Error('LEGACY_DATABASE_URL is required for safe KK ID alignment. API startup blocked.');
  }

  app.listen(PORT, () => {
    console.log(`Khushhal Kisan Survey API listening on port ${PORT}`);
  });
}

start();
