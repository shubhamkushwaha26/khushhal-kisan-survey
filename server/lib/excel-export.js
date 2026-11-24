import ExcelJS from 'exceljs';

export function isValidPendingRow(row) {
  const answers = row.answers || {};
  const name = String(row.name || answers.name || answers.contact_person || answers.fpo_name || '').trim();
  const digits = String(row.mobile || answers.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return Boolean(name && /^[6-9]\d{9}$/.test(digits));
}

export async function createSixSheetWorkbook({ localRows = [], legacyRows = [], currentCatalog = {}, legacyQuestionLabels = {}, legacyUnavailable = false }) {
  const completed = localRows.filter(row => row.status === 'completed' && (row.survey_version || 'new') === 'new');
  const pending = localRows.filter(row => row.status === 'draft' && (row.survey_version || 'new') === 'new' && isValidPendingRow(row));
  const legacySubmitted = legacyRows.filter(row => row.status === 'completed');
  const legacyKeys = {
    farmer: ['age','land','name','crops','email','pilot','mobile','appsUsed','infoGaps','language','location','useIntent','experience','seasonCost','smartphone','infoSources','topProblems','digitalNeeds','paymentModel','trustFactors','financialLoss','landOwnership','whatsappGroup','photoDiagnosis','digitalBarriers','seriousProblems','willingnessToPay','diseaseExperience','paymentConditions','recommend','firstProblem','paidServices','recentProblem','timelyBenefit','trustEvidence','referral','khushhal_app_useful'],
    stakeholder: ['name','email','mobile','sponsorship','digitalTools','adoptionNeeds','valueCreation','whatsappGroup','pilotReadiness','guidanceProcess','stakeholderLoss','farmersSupported','stakeholderProblems','khushhal_app_useful']
  };
  const currentKeys = {
    farmer: (currentCatalog.farmer || []).map(question => question.id),
    stakeholder: (currentCatalog.stakeholder || []).map(question => question.id)
  };
  const label = (type, key, version) => {
    if (version === 'new') {
      const question = (currentCatalog[type] || []).find(item => item.id === key);
      return String(question?.en || key).trim();
    }

    const old = legacyQuestionLabels[`${type}:${key}`] ||
      legacyQuestionLabels[`${type === 'stakeholder' ? 'fpo' : type}:${key}`];

    if (old) {
      return `${old.question_text_hi || ''} | ${old.question_text_en || ''} | ${old.question_text_as || ''}`
        .replace(/^\s*\|\s*|\s*\|\s*$/g, '');
    }
    if (key === 'khushhal_app_useful') {
      const question = (currentCatalog[type] || []).find(item => item.id === key);
      return String(question?.en || 'Khushhal Kisan App Usefulness').trim();
    }

    return key;
  };
  const safeValue = value => {
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) return value.map(safeValue).join(' | ');
    if (typeof value === 'object') return value.dataUrl ? `Photo attached: ${value.fileName || 'image'}` : JSON.stringify(value);
    return value;
  };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Khushhal Kisan';
  workbook.created = new Date();
  const sheets = [
    { name: 'New Farmer', rows: completed.filter(row => row.survey_type === 'farmer'), type: 'farmer', version: 'new', keys: currentKeys.farmer, source: 'New (Local)' },
    { name: 'New FPO', rows: completed.filter(row => row.survey_type === 'stakeholder'), type: 'stakeholder', version: 'new', keys: currentKeys.stakeholder, source: 'New (Local)' },
    { name: 'Pending Farmer', rows: pending.filter(row => row.survey_type === 'farmer'), type: 'farmer', version: 'new', keys: currentKeys.farmer, source: 'New (Local)' },
    { name: 'Pending FPO', rows: pending.filter(row => row.survey_type === 'stakeholder'), type: 'stakeholder', version: 'new', keys: currentKeys.stakeholder, source: 'New (Local)' },
    { name: 'Old Farmer', rows: legacySubmitted.filter(row => row.survey_type === 'farmer'), type: 'farmer', version: 'legacy', keys: legacyKeys.farmer, source: 'Old (Neon)' },
    { name: 'Old FPO', rows: legacySubmitted.filter(row => ['stakeholder','fpo'].includes(row.survey_type)), type: 'stakeholder', version: 'legacy', keys: legacyKeys.stakeholder, source: 'Old (Neon)' }
  ];
  for (const config of sheets) {
    const sheet = workbook.addWorksheet(config.name);
    const headers = ['ID','Previous ID','Name','Mobile','Address','Date','Source',...config.keys.map(key => label(config.type, key, config.version))];
    sheet.addRow(headers);
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245A3A' } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    if (config.version === 'legacy' && legacyUnavailable) {
      const note = sheet.addRow(['Historical Neon data unavailable. This sheet contains no historical records in this export.']);
      note.font = { italic: true, color: { argb: 'FF9C0006' } };
    }
    for (const row of config.rows) {
      let answers = row.answers || {};
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = {}; } }
      sheet.addRow([
        row.response_id || row.survey_id || row.id || '', row.legacy_response_id || '',
        row.name || answers.name || answers.contact_person || answers.fpo_name || '',
        row.mobile || answers.mobile || '', row.address || row.location || answers.address || answers.fpo_district || '',
        row.submitted_at || row.created_at || row.updated_at || '', config.source,
        ...config.keys.map(key => safeValue(answers[key] ?? row[key]))
      ]);
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    sheet.columns.forEach((column, index) => { column.width = index < 7 ? (index === 5 ? 22 : 19) : 34; });
    sheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 52 : 30;
      row.alignment = { vertical: 'top', wrapText: true };
    });
  }
  return workbook;
}
