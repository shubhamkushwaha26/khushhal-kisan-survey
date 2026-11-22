import { writeFile } from 'node:fs/promises';
import { FARMER_SECTIONS, FPO_SECTIONS } from '../client/src/questionnaire.js';

const esc = (v) => v == null || v === '' ? 'NULL' : "'" + String(v).replaceAll("'", "''") + "'";

const rows = [];

function addQuestion(type, q, number = q.number) {
  rows.push({
    type,
    id: q.id,
    number,
    hi: q.hi ?? q.label?.hi,
    en: q.en ?? q.label?.en,
    as: q.as ?? q.label?.as,
    answerType: q.type ?? 'text'
  });
}

function collect(type, sections) {
  for (const section of sections) {
    for (const q of section.questions) {
      addQuestion(type, q);

      for (let i = 0; i < (q.subFields || []).length; i++) {
        const f = q.subFields[i];
        addQuestion(type, {
          id: f.id,
          label: f.label,
          type: f.type || 'text'
        }, q.number ? `${q.number}.${i + 1}` : null);
      }

      if (q.attachedFile) {
        addQuestion(type, {
          id: q.attachedFile.id,
          label: q.attachedFile.label,
          type: 'file'
        }, q.attachedFile.number || null);
      }
    }
  }
}

collect('farmer', FARMER_SECTIONS);
collect('stakeholder', FPO_SECTIONS);

const values = rows.map(r =>
  `(${esc(r.type)}, ${esc(r.id)}, ${esc(r.number)}, ${esc(r.hi)}, ${esc(r.en)}, ${esc(r.as)}, ${esc(r.id)}, ${esc(r.answerType)})`
).join(',\n');

const sql = `-- Current Khushhal Kisan questionnaire catalog
-- Generated from client/src/questionnaire.js
-- Existing response records are not modified.

INSERT INTO public.survey_question_catalog
(survey_type, question_id, question_number, question_text_hi,
 question_text_en, question_text_as, answer_column, answer_type)
VALUES
${values}
ON CONFLICT (survey_type, question_id)
DO UPDATE SET
 question_number = EXCLUDED.question_number,
 question_text_hi = EXCLUDED.question_text_hi,
 question_text_en = EXCLUDED.question_text_en,
 question_text_as = EXCLUDED.question_text_as,
 answer_column = EXCLUDED.answer_column,
 answer_type = EXCLUDED.answer_type;

`;

await writeFile(
  new URL('./migrations/003_current_question_catalog.sql', import.meta.url),
  sql,
  'utf8'
);

console.log('SQL file generated successfully.');
console.log('Total catalog entries:', rows.length);
console.log('Farmer:', rows.filter(r => r.type === 'farmer').length);
console.log('Stakeholder:', rows.filter(r => r.type === 'stakeholder').length);
console.log('File: server/migrations/003_current_question_catalog.sql');
