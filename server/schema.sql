CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  response_id VARCHAR(40) UNIQUE NOT NULL,
  survey_type VARCHAR(30) NOT NULL CHECK (survey_type IN ('farmer','stakeholder')),
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  answers JSONB NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_type ON survey_responses (survey_type);

-- Draft support: existing survey records are preserved.
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