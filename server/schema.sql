BEGIN;


-- =========================================================
-- KHUSHHAL KISAN SURVEY DATABASE
-- SAFE, ADDITIVE MIGRATION
-- Existing survey records and JSONB answers are preserved.
-- =========================================================

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  response_id VARCHAR(40) UNIQUE NOT NULL,
  survey_type VARCHAR(30) NOT NULL
    CHECK (survey_type IN ('farmer','stakeholder')),
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  answers JSONB NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing indexes
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
ON survey_responses (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_type
ON survey_responses (survey_type);

-- Existing draft support
ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS draft_key VARCHAR(100);

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_draft_key
ON survey_responses (draft_key)
WHERE draft_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_status
ON survey_responses (status);


-- =========================================================
-- FARMER MASTER TABLE
-- Mobile number is intentionally NOT unique.
-- =========================================================

CREATE TABLE IF NOT EXISTS farmers (
  id BIGSERIAL PRIMARY KEY,
  farmer_id VARCHAR(40) UNIQUE NOT NULL,
  name TEXT,
  mobile VARCHAR(20),
  email TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure the expected farmer master identifiers exist even when
-- this migration is applied over an older farmers table.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS farmer_id VARCHAR(40);
UPDATE farmers
SET farmer_id = 'HKF-OLD-' || SUBSTRING(MD5(id::text), 1, 20)
WHERE farmer_id IS NULL OR BTRIM(farmer_id) = '';
ALTER TABLE farmers ALTER COLUMN farmer_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_farmers_id_unique ON farmers (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_farmers_farmer_id_unique ON farmers (farmer_id);


CREATE INDEX IF NOT EXISTS idx_farmers_mobile
ON farmers (mobile);

CREATE INDEX IF NOT EXISTS idx_farmers_name
ON farmers (name);


-- Link survey records to farmer master records.
ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS farmer_id BIGINT
REFERENCES farmers(id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_farmer_id
ON survey_responses (farmer_id);


-- =========================================================
-- FARMER QUESTION COLUMNS
-- Each question has its own column.
-- Unanswered questions remain NULL.
-- =========================================================

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS age TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS experience TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS land TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS crops TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "landOwnership" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "topProblems" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "seriousProblems" JSONB;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "financialLoss" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "diseaseExperience" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "infoSources" JSONB;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "infoGaps" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "seasonCost" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS smartphone TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "appsUsed" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "photoDiagnosis" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "digitalNeeds" JSONB;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "languagePreference" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "trustFactors" JSONB;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "digitalBarriers" JSONB;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "useIntent" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "paymentModel" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "willingnessToPay" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "paymentConditions" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS pilot TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "recentProblem" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "timelyBenefit" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "paidServices" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "trustEvidence" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "firstProblem" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS recommend TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS referral TEXT;


-- =========================================================
-- STAKEHOLDER QUESTION COLUMNS
-- =========================================================

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "farmersSupported" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "stakeholderProblems" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "guidanceProcess" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "stakeholderLoss" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "digitalTools" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "valueCreation" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "pilotReadiness" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS "adoptionNeeds" TEXT;

ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS sponsorship TEXT;


-- New farmer contact fields are additive and safe to re-run.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS mobile VARCHAR(20);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS mobile VARCHAR(20);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS "whatsappGroup" TEXT;

CREATE INDEX IF NOT EXISTS idx_farmers_mobile ON farmers (mobile);
CREATE INDEX IF NOT EXISTS idx_survey_responses_mobile ON survey_responses (mobile);

-- =========================================================
-- BACKFILL OLD RECORDS
-- Copy existing JSONB answers into their matching columns.
-- Missing keys remain NULL.
-- =========================================================

UPDATE survey_responses
SET
  name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(answers->>'name'), '')),
  location = COALESCE(NULLIF(BTRIM(location), ''), NULLIF(BTRIM(answers->>'location'), '')),
  age = COALESCE(NULLIF(BTRIM(age), ''), NULLIF(BTRIM(answers->>'age'), '')),
  experience = COALESCE(NULLIF(BTRIM(experience), ''), NULLIF(BTRIM(answers->>'experience'), '')),
  land = COALESCE(NULLIF(BTRIM(land), ''), NULLIF(BTRIM(answers->>'land'), '')),
  crops = COALESCE(NULLIF(BTRIM(crops), ''), NULLIF(BTRIM(answers->>'crops'), '')),
  "landOwnership" = COALESCE(NULLIF(BTRIM("landOwnership"), ''), NULLIF(BTRIM(answers->>'landOwnership'), '')),
  "topProblems" = COALESCE(NULLIF(BTRIM("topProblems"), ''), NULLIF(BTRIM(answers->>'topProblems'), '')),
  "seriousProblems" = COALESCE("seriousProblems", answers->'seriousProblems'),
  "financialLoss" = COALESCE(NULLIF(BTRIM("financialLoss"), ''), NULLIF(BTRIM(answers->>'financialLoss'), '')),
  "diseaseExperience" = COALESCE(NULLIF(BTRIM("diseaseExperience"), ''), NULLIF(BTRIM(answers->>'diseaseExperience'), '')),
  "infoSources" = COALESCE("infoSources", answers->'infoSources'),
  "infoGaps" = COALESCE(NULLIF(BTRIM("infoGaps"), ''), NULLIF(BTRIM(answers->>'infoGaps'), '')),
  "seasonCost" = COALESCE(NULLIF(BTRIM("seasonCost"), ''), NULLIF(BTRIM(answers->>'seasonCost'), '')),
  smartphone = COALESCE(NULLIF(BTRIM(smartphone), ''), NULLIF(BTRIM(answers->>'smartphone'), '')),
  "appsUsed" = COALESCE(NULLIF(BTRIM("appsUsed"), ''), NULLIF(BTRIM(answers->>'appsUsed'), '')),
  "photoDiagnosis" = COALESCE(NULLIF(BTRIM("photoDiagnosis"), ''), NULLIF(BTRIM(answers->>'photoDiagnosis'), '')),
  "digitalNeeds" = COALESCE("digitalNeeds", answers->'digitalNeeds'),
  "languagePreference" = COALESCE(NULLIF(BTRIM("languagePreference"), ''), NULLIF(BTRIM(answers->>'language'), '')),
  "trustFactors" = COALESCE("trustFactors", answers->'trustFactors'),
  "digitalBarriers" = COALESCE("digitalBarriers", answers->'digitalBarriers'),
  "useIntent" = COALESCE(NULLIF(BTRIM("useIntent"), ''), NULLIF(BTRIM(answers->>'useIntent'), '')),
  "paymentModel" = COALESCE(NULLIF(BTRIM("paymentModel"), ''), NULLIF(BTRIM(answers->>'paymentModel'), '')),
  "willingnessToPay" = COALESCE(NULLIF(BTRIM("willingnessToPay"), ''), NULLIF(BTRIM(answers->>'willingnessToPay'), '')),
  "paymentConditions" = COALESCE(NULLIF(BTRIM("paymentConditions"), ''), NULLIF(BTRIM(answers->>'paymentConditions'), '')),
  pilot = COALESCE(NULLIF(BTRIM(pilot), ''), NULLIF(BTRIM(answers->>'pilot'), '')),
  "recentProblem" = COALESCE(NULLIF(BTRIM("recentProblem"), ''), NULLIF(BTRIM(answers->>'recentProblem'), '')),
  "timelyBenefit" = COALESCE(NULLIF(BTRIM("timelyBenefit"), ''), NULLIF(BTRIM(answers->>'timelyBenefit'), '')),
  "paidServices" = COALESCE(NULLIF(BTRIM("paidServices"), ''), NULLIF(BTRIM(answers->>'paidServices'), '')),
  "trustEvidence" = COALESCE(NULLIF(BTRIM("trustEvidence"), ''), NULLIF(BTRIM(answers->>'trustEvidence'), '')),
  "firstProblem" = COALESCE(NULLIF(BTRIM("firstProblem"), ''), NULLIF(BTRIM(answers->>'firstProblem'), '')),
  recommend = COALESCE(NULLIF(BTRIM(recommend), ''), NULLIF(BTRIM(answers->>'recommend'), '')),
  referral = COALESCE(NULLIF(BTRIM(referral), ''), NULLIF(BTRIM(answers->>'referral'), '')),
  "farmersSupported" = COALESCE(NULLIF(BTRIM("farmersSupported"), ''), NULLIF(BTRIM(answers->>'farmersSupported'), '')),
  "stakeholderProblems" = COALESCE(NULLIF(BTRIM("stakeholderProblems"), ''), NULLIF(BTRIM(answers->>'stakeholderProblems'), '')),
  "guidanceProcess" = COALESCE(NULLIF(BTRIM("guidanceProcess"), ''), NULLIF(BTRIM(answers->>'guidanceProcess'), '')),
  "stakeholderLoss" = COALESCE(NULLIF(BTRIM("stakeholderLoss"), ''), NULLIF(BTRIM(answers->>'stakeholderLoss'), '')),
  "digitalTools" = COALESCE(NULLIF(BTRIM("digitalTools"), ''), NULLIF(BTRIM(answers->>'digitalTools'), '')),
  "valueCreation" = COALESCE(NULLIF(BTRIM("valueCreation"), ''), NULLIF(BTRIM(answers->>'valueCreation'), '')),
  "pilotReadiness" = COALESCE(NULLIF(BTRIM("pilotReadiness"), ''), NULLIF(BTRIM(answers->>'pilotReadiness'), '')),
  "adoptionNeeds" = COALESCE(NULLIF(BTRIM("adoptionNeeds"), ''), NULLIF(BTRIM(answers->>'adoptionNeeds'), '')),
  sponsorship = COALESCE(NULLIF(BTRIM(sponsorship), ''), NULLIF(BTRIM(answers->>'sponsorship'), '')),
  mobile = COALESCE(NULLIF(BTRIM(mobile), ''), NULLIF(BTRIM(answers->>'mobile'), '')),
  email = COALESCE(NULLIF(BTRIM(email), ''), NULLIF(BTRIM(answers->>'email'), '')),
  "whatsappGroup" = COALESCE(NULLIF(BTRIM("whatsappGroup"), ''), NULLIF(BTRIM(answers->>'whatsappGroup'), ''))
WHERE answers IS NOT NULL;



-- =========================================================
-- LEGACY FARMER MASTER BACKFILL
-- Create a deterministic master row for historical farmer
-- submissions that do not yet have a farmer_id. This is
-- repeatable and does not overwrite existing farmer records.
-- =========================================================

-- First attach historical responses to an existing farmer master row
-- when the normalized 10-digit mobile number matches.
UPDATE survey_responses sr
SET farmer_id = f.id
FROM farmers f
WHERE sr.farmer_id IS NULL
  AND sr.survey_type = 'farmer'
  AND sr.status = 'completed'
  AND NULLIF(REGEXP_REPLACE(COALESCE(sr.mobile, sr.answers->>'mobile', ''), '\D', '', 'g'), '') IS NOT NULL
  AND RIGHT(REGEXP_REPLACE(COALESCE(sr.mobile, sr.answers->>'mobile', ''), '\D', '', 'g'), 10)
      = RIGHT(REGEXP_REPLACE(COALESCE(f.mobile, ''), '\D', '', 'g'), 10);

INSERT INTO farmers (farmer_id, name, mobile, email, location)
SELECT
  'HKF-LEGACY-' || SUBSTRING(MD5(sr.response_id), 1, 20),
  COALESCE(sr.name, NULLIF(BTRIM(sr.answers->>'name'), '')),
  COALESCE(sr.mobile, NULLIF(BTRIM(sr.answers->>'mobile'), '')),
  COALESCE(sr.email, NULLIF(BTRIM(sr.answers->>'email'), '')),
  COALESCE(sr.location, NULLIF(BTRIM(sr.answers->>'location'), ''))
FROM survey_responses sr
WHERE sr.survey_type = 'farmer'
  AND sr.status = 'completed'
  AND sr.farmer_id IS NULL
  AND (
    COALESCE(sr.name, NULLIF(BTRIM(sr.answers->>'name'), '')) IS NOT NULL
    OR COALESCE(sr.mobile, NULLIF(BTRIM(sr.answers->>'mobile'), '')) IS NOT NULL
  )
ON CONFLICT (farmer_id) DO NOTHING;

UPDATE survey_responses sr
SET farmer_id = f.id
FROM farmers f
WHERE sr.farmer_id IS NULL
  AND sr.survey_type = 'farmer'
  AND f.farmer_id = 'HKF-LEGACY-' || SUBSTRING(MD5(sr.response_id), 1, 20);

CREATE SEQUENCE IF NOT EXISTS public.survey_response_code_seq START WITH 6;

COMMIT;





