BEGIN;

-- New-database-only additive migration. Never run this file against Neon.
CREATE SEQUENCE IF NOT EXISTS public.survey_kk_code_seq START WITH 1 INCREMENT BY 1;

-- Resume above existing KK IDs in this NEW database; this does not modify rows.
SELECT setval(
  'public.survey_kk_code_seq',
  GREATEST(
    COALESCE((
      SELECT MAX((substring(response_id from '^KK-([0-9]+)$'))::BIGINT)
      FROM public.survey_responses
      WHERE response_id ~ '^KK-[0-9]+$'
    ), 0) + 1,
    1
  ),
  false
);

COMMIT;
