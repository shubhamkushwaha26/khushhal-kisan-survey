-- Khushhal Kisan app usefulness question
-- Replaces seven AI rating questions in Farmer and FPO questionnaires.
-- Existing ratings are consolidated to Yes; the read-only Neon database is
-- intentionally not modified by this migration.

BEGIN;

-- Ensure the normalized answer table used by syncSurveyAnswerRows exists.
CREATE TABLE IF NOT EXISTS public.survey_answers (
  survey_response_id BIGINT NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (survey_response_id, question_id)
);

ALTER TABLE public.survey_answers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Register the new mandatory Yes/No question for both survey types.
INSERT INTO public.survey_question_catalog
  (survey_type, question_id, question_number, question_text_hi,
   question_text_en, question_text_as, answer_column, answer_type)
VALUES
  ('farmer', 'khushhal_app_useful', '26',
   'क्या खुशहाल किसान मोबाइल ऐप के माध्यम से खेती से जुड़ी समस्याओं के समाधान, फसल की जानकारी, मौसम, सिंचाई एवं मंडी भाव जैसी सुविधाएँ उपलब्ध कराना आपके लिए उपयोगी रहेगा?',
   'Would it be useful to you if the Khushhal Kisan mobile app provided solutions to farming-related problems, crop information, weather updates, irrigation guidance and mandi prices?',
   'খুশহাল কিষাণ ম’বাইল এপৰ জৰিয়তে কৃষি-সম্পৰ্কীয় সমস্যাৰ সমাধান, শস্যৰ তথ্য, বতৰৰ আপডেট, জলসিঞ্চনৰ পৰামৰ্শ আৰু মাণ্ডীৰ মূল্যৰ দৰে সুবিধা প্ৰদান কৰিলে আপোনাৰ বাবে উপযোগী হ’বনে?',
   'khushhal_app_useful', 'radio'),
  ('stakeholder', 'khushhal_app_useful', '12',
   'क्या खुशहाल किसान मोबाइल ऐप के माध्यम से खेती से जुड़ी समस्याओं के समाधान, फसल की जानकारी, मौसम, सिंचाई एवं मंडी भाव जैसी सुविधाएँ उपलब्ध कराना आपके लिए उपयोगी रहेगा?',
   'Would it be useful to you if the Khushhal Kisan mobile app provided solutions to farming-related problems, crop information, weather updates, irrigation guidance and mandi prices?',
   'খুশহাল কিষাণ ম’বাইল এপৰ জৰিয়তে কৃষি-সম্পৰ্কীয় সমস্যাৰ সমাধান, শস্যৰ তথ্য, বতৰৰ আপডেট, জলসিঞ্চনৰ পৰামৰ্শ আৰু মাণ্ডীৰ মূল্যৰ দৰে সুবিধা প্ৰদান কৰিলে আপোনাৰ বাবে উপযোগী হ’বনে?',
   'khushhal_app_useful', 'radio')
ON CONFLICT (survey_type, question_id) DO UPDATE SET
  question_number = EXCLUDED.question_number,
  question_text_hi = EXCLUDED.question_text_hi,
  question_text_en = EXCLUDED.question_text_en,
  question_text_as = EXCLUDED.question_text_as,
  answer_column = EXCLUDED.answer_column,
  answer_type = EXCLUDED.answer_type;

-- Convert any stored historical rating into one Yes answer in the writable
-- current database's normalized answer table before removing the old keys.
INSERT INTO public.survey_answers (survey_response_id, question_id, answer_value)
SELECT sr.id, 'khushhal_app_useful',
       CASE
         WHEN sr.answers->>'khushhal_app_useful' IN ('Yes','No')
           THEN to_jsonb(sr.answers->>'khushhal_app_useful')
         ELSE '"Yes"'::jsonb
       END
FROM public.survey_responses sr
WHERE EXISTS (
  SELECT 1
  FROM unnest(ARRAY[
    'ai_crop','ai_yield','ai_disease','ai_irrigation',
    'ai_pest_risk','ai_market','ai_cost'
  ]::TEXT[]) AS old_rating(key)
  WHERE NULLIF(BTRIM(sr.answers->>old_rating.key), '') IS NOT NULL
)
OR NULLIF(BTRIM(sr.ai_crop), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_yield), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_disease), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_irrigation), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_pest_risk), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_market), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_cost), '') IS NOT NULL
ON CONFLICT (survey_response_id, question_id) DO UPDATE SET
  answer_value = CASE
    WHEN public.survey_answers.answer_value #>> '{}' IN ('Yes', 'No')
      THEN public.survey_answers.answer_value
    ELSE EXCLUDED.answer_value
  END,
  updated_at = NOW();

-- Convert the JSONB source of truth and remove the retired rating keys.
UPDATE public.survey_responses sr
SET answers =
  (COALESCE(sr.answers, '{}'::jsonb) -
    ARRAY['ai_crop','ai_yield','ai_disease','ai_irrigation',
          'ai_pest_risk','ai_market','ai_cost']::TEXT[])
  || jsonb_build_object(
       'khushhal_app_useful',
       COALESCE(
  (
    SELECT sa.answer_value
    FROM public.survey_answers sa
    WHERE sa.survey_response_id = sr.id
      AND sa.question_id = 'khushhal_app_useful'
      AND sa.answer_value #>> '{}' IN ('Yes', 'No')
    LIMIT 1
  ),
  CASE
    WHEN sr.answers->>'khushhal_app_useful' IN ('Yes', 'No')
      THEN to_jsonb(sr.answers->>'khushhal_app_useful')
    ELSE '"Yes"'::jsonb
  END
)
     )
WHERE EXISTS (
  SELECT 1
  FROM unnest(ARRAY[
    'ai_crop','ai_yield','ai_disease','ai_irrigation',
    'ai_pest_risk','ai_market','ai_cost'
  ]::TEXT[]) AS old_rating(key)
  WHERE NULLIF(BTRIM(sr.answers->>old_rating.key), '') IS NOT NULL
)
OR NULLIF(BTRIM(sr.ai_crop), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_yield), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_disease), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_irrigation), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_pest_risk), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_market), '') IS NOT NULL
OR NULLIF(BTRIM(sr.ai_cost), '') IS NOT NULL;

-- Retire the old physical columns after their values have been consolidated.
UPDATE public.survey_responses
SET ai_crop = NULL,
    ai_yield = NULL,
    ai_disease = NULL,
    ai_irrigation = NULL,
    ai_pest_risk = NULL,
    ai_market = NULL,
    ai_cost = NULL
WHERE ai_crop IS NOT NULL OR ai_yield IS NOT NULL OR ai_disease IS NOT NULL
   OR ai_irrigation IS NOT NULL OR ai_pest_risk IS NOT NULL
   OR ai_market IS NOT NULL OR ai_cost IS NOT NULL;

-- Also consolidate historical ratings that exist in the normalized answer
-- table even if their JSONB mirror is incomplete.
INSERT INTO public.survey_answers (survey_response_id, question_id, answer_value)
SELECT DISTINCT old_answer.survey_response_id, 'khushhal_app_useful',
       CASE
         WHEN sr.answers->>'khushhal_app_useful' IN ('Yes', 'No')
           THEN to_jsonb(sr.answers->>'khushhal_app_useful')
         ELSE '"Yes"'::jsonb
       END
FROM public.survey_answers old_answer
JOIN public.survey_responses sr
  ON sr.id = old_answer.survey_response_id
WHERE old_answer.question_id IN (
  'ai_crop','ai_yield','ai_disease','ai_irrigation',
  'ai_pest_risk','ai_market','ai_cost'
)
ON CONFLICT (survey_response_id, question_id) DO UPDATE SET
  answer_value = CASE
    WHEN public.survey_answers.answer_value #>> '{}' IN ('Yes', 'No')
      THEN public.survey_answers.answer_value
    ELSE EXCLUDED.answer_value
  END,
  updated_at = NOW();

-- Ensure the JSONB source of truth is also converted when the normalized
-- answer table was the only place containing the previous ratings.
UPDATE public.survey_responses sr
SET answers =
  (COALESCE(sr.answers, '{}'::jsonb) -
    ARRAY['ai_crop','ai_yield','ai_disease','ai_irrigation',
          'ai_pest_risk','ai_market','ai_cost']::TEXT[])
  || jsonb_build_object(
       'khushhal_app_useful',
       COALESCE(
  (
    SELECT sa.answer_value
    FROM public.survey_answers sa
    WHERE sa.survey_response_id = sr.id
      AND sa.question_id = 'khushhal_app_useful'
      AND sa.answer_value #>> '{}' IN ('Yes', 'No')
    LIMIT 1
  ),
  CASE
    WHEN sr.answers->>'khushhal_app_useful' IN ('Yes', 'No')
      THEN to_jsonb(sr.answers->>'khushhal_app_useful')
    ELSE '"Yes"'::jsonb
  END
)
     )
WHERE EXISTS (
  SELECT 1
  FROM public.survey_answers sa
  WHERE sa.survey_response_id = sr.id
    AND sa.question_id = 'khushhal_app_useful'
);

-- Remove any remaining retired JSONB keys, including empty values.
-- Empty legacy keys alone must not create a new Yes answer.
UPDATE public.survey_responses
SET answers = COALESCE(answers, '{}'::jsonb) -
  ARRAY[
    'ai_crop','ai_yield','ai_disease','ai_irrigation',
    'ai_pest_risk','ai_market','ai_cost'
  ]::TEXT[]
WHERE COALESCE(answers, '{}'::jsonb) ?| ARRAY[
  'ai_crop','ai_yield','ai_disease','ai_irrigation',
  'ai_pest_risk','ai_market','ai_cost'
]::TEXT[];

-- Remove retired answer rows and catalog entries after conversion.
DELETE FROM public.survey_answers sa
USING public.survey_responses sr
WHERE sr.id = sa.survey_response_id
  AND sr.survey_type IN ('farmer','stakeholder')
  AND sa.question_id IN (
    'ai_crop','ai_yield','ai_disease','ai_irrigation',
    'ai_pest_risk','ai_market','ai_cost'
  );

DELETE FROM public.survey_question_catalog
WHERE survey_type IN ('farmer','stakeholder')
  AND question_id IN (
    'ai_crop','ai_yield','ai_disease','ai_irrigation',
    'ai_pest_risk','ai_market','ai_cost'
  );

COMMIT;
