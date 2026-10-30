const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const htmlPath = path.join(__dirname, '..', 'fm-patient-record.html');
const source = fs.readFileSync(htmlPath, 'utf8');

function loadPointKey() {
    const match = source.match(/function pointKey\(rowName, header, columnIndex, isMergedMe\) \{[\s\S]*?\n        \}/);
    assert.ok(match, 'Expected pointKey to be defined in fm-patient-record.html.');

    let headers;
    let layout;
    eval(match[0]);

    return (rowName, header, columnIndex, isMergedMe, nextHeaders, nextLayout) => {
        headers = nextHeaders;
        layout = nextLayout;
        return pointKey(rowName, header, columnIndex, isMergedMe);
    };
}

function layoutCsv(name) {
    const layoutStart = source.indexOf(`name: '${name}'`);
    assert.notEqual(layoutStart, -1, `Expected ${name} layout.`);

    const csvStart = source.indexOf('csv: `', layoutStart) + 'csv: `'.length;
    const csvEnd = source.indexOf('`', csvStart);
    return source.slice(csvStart, csvEnd);
}

function parseLayout(name) {
    const [headerLine, ...dataLines] = layoutCsv(name).trim().split('\n');
    const headers = headerLine.split(',').slice(1);
    const rows = dataLines.map(line => line.split(','));
    const layout = { rightMeColumn: name === 'FMMD' ? 6 : 15, moveRightMeToRe: name === 'FMID' };

    if (layout.moveRightMeToRe) {
        const move = new Set(['GE1', 'TA1', 'PE1', 'SC1', 'HU', 'CU1', 'CA1', 'DI1']);
        rows.forEach(row => {
            if (move.has(row[0])) {
                row[layout.rightMeColumn + 1] = '';
                row[layout.rightMeColumn + 2] = 'x';
            }
        });
        rows.find(row => row[0] === 'CX')[layout.rightMeColumn + 1] = '';
    }

    return { headers, rows, layout };
}

function visibleKeys(name, rowName) {
    const { headers, rows, layout } = parseLayout(name);
    const row = rows.find(([name]) => name === rowName);
    assert.ok(row, `Expected ${rowName} row in ${name}.`);

    const marks = row.slice(1);
    const pointKey = loadPointKey();

    return headers.flatMap((header, index) => marks[index] === 'x'
        ? [pointKey(rowName, header, index, false, headers, layout)]
        : []);
}

function allVisibleKeys(name) {
    const { headers, rows, layout } = parseLayout(name);
    const pointKey = loadPointKey();
    const mergedMeRows = new Set(['CP2', 'CP3', 'CL', 'TH1', 'TH2', 'TH3', 'LU1P', 'LU2', 'LU3D', 'PV1P', 'PV2', 'PV3D']);
    const firstMeColumn = 4;

    return rows.flatMap(([rowName, ...marks]) => headers.flatMap((header, index) => {
        if (mergedMeRows.has(rowName) && index === firstMeColumn + 1) return [];
        const isMergedMe = mergedMeRows.has(rowName) && index === firstMeColumn;
        const hasPoint = isMergedMe
            ? marks.slice(firstMeColumn, firstMeColumn + 2).some(mark => mark === 'x')
            : marks[index] === 'x';
        return hasPoint ? [pointKey(rowName, header, index, isMergedMe, headers, layout)] : [];
    }));
}

function duplicateKeys(keys) {
    return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))].sort();
}

function sourceBlock(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `Expected ${startMarker} in fm-patient-record.html.`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `Expected ${endMarker} after ${startMarker}.`);
    return source.slice(start, end);
}

function loadGuideGroups() {
    const block = sourceBlock('const guideGroups = ', '        const guideSets = ');
    return eval(`(${block.replace(/^const guideGroups = /, '').trim().replace(/;$/, '')})`);
}

function loadBalanceRules() {
    const block = sourceBlock('const balanceRules = ', '        const normalizeCu1Key = ');
    const balanceRules = eval(`(${block.replace(/^const balanceRules = /, '').trim().replace(/;$/, '')})`);
    const normalizeCu1Key = key => key.replace(/^(an-me|an-la|re-la)-cu-(lt|rt)$/, '$1-cu1-$2');

    return Object.fromEntries(Object.entries(balanceRules).map(([key, rules]) => [
        normalizeCu1Key(key),
        Object.fromEntries(Object.entries(rules).map(([ruleName, values]) => [ruleName, values.map(normalizeCu1Key)]))
    ]));
}

function functionSource(name) {
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`));
    assert.ok(match, `Expected ${name} to be defined in fm-patient-record.html.`);
    return match[0];
}

function loadNormalizers() {
    const definitions = [
        'patientDetailsFields',
        'normalizePatientDetails',
        'normalizeTreatmentNumber',
        'validatePainHistory',
        'normalizeTreatmentData',
        'normalizeTreatments',
        'normalizePatients'
    ].map(functionSource).join('\n');
    const document = {
        querySelectorAll: () => [
            { id: 'patient_name' }, { id: 'patient_age_gender' }, { id: 'record_date' },
            { id: 'occupation' }, { id: 'sport_frequency' }, { id: 'history' }, { id: 'trauma' }
        ]
    };

    return Function('document', `
        const bodyHistoryAges = ['1m', '3m', '6m', '1y', '2y', '3y', '4y', '5y', '7y', '10y', '15y', '20y', '25y', '30y'];
        const treatmentResultValues = ['+++', '++', '+', 'NC', 'X', '-', '--', '---', 'clear'];
        ${definitions}
        return { normalizeTreatmentNumber, normalizeTreatmentData, validatePainHistory, normalizePatients };
    `)(document);
}

const expectedCu1Keys = [
    'an-la-cu1-lt', 'an-la-cu1-rt',
    'an-me-cu1-lt', 'an-me-cu1-rt',
    're-la-cu1-lt', 're-la-cu1-rt',
    're-me-cu1-lt', 're-me-cu1-rt'
].sort();

const expectedCu2Keys = expectedCu1Keys.map(key => key.replace('cu1', 'cu2')).sort();

test('both layouts provide a marker for every grid column', () => {
    for (const name of ['FMMD', 'FMID']) {
        const { headers, rows } = parseLayout(name);
        assert.equal(headers.length, 21, `${name} should have 21 point columns.`);
        rows.forEach(row => assert.ok(row.length >= headers.length + 1, `${name} ${row[0]} should have one marker per point column.`));
    }
});

test('pointKey preserves representative aliases, sides, and row variants', () => {
    const pointKey = loadPointKey();
    const fmmd = parseLayout('FMMD');
    const fmid = parseLayout('FMID');
    const key = (rowName, header, columnIndex, isMergedMe, parsed) => pointKey(rowName, header, columnIndex, isMergedMe, parsed.headers, parsed.layout);

    assert.equal(key('CP1', 'L|AN', 0, false, fmmd), 'an-cp1-lt');
    assert.equal(key('CP2', 'L|ME', 4, true, fmmd), 'me-cp2-a');
    assert.equal(key('CU1', 'L|AM', 14, false, fmmd), 'an-me-cu1-lt');
    assert.equal(key('CU2', 'R|RL', 20, false, fmmd), 're-la-cu2-rt');
    assert.equal(key('LU1P', 'R|IR', 2, false, fmid), 'ir-lu-p-rt');
});

for (const layoutName of ['FMMD', 'FMID']) {
    test(`${layoutName} renders every CU1 combination with its numbered key`, () => {
        const keys = visibleKeys(layoutName, 'CU1').filter(key => key.includes('-cu1-')).sort();
        assert.deepEqual(keys, expectedCu1Keys);
    });

    test(`${layoutName} renders every CU2 combination with its numbered key`, () => {
        const keys = visibleKeys(layoutName, 'CU2').filter(key => key.includes('-cu2-')).sort();
        assert.deepEqual(keys, expectedCu2Keys);
    });

    test(`${layoutName} renders only its expected duplicate point keys`, () => {
        const keys = allVisibleKeys(layoutName);
        const expectedDuplicates = layoutName === 'FMID' ? ['la-cu-rt'] : [];
        assert.deepEqual(duplicateKeys(keys), expectedDuplicates);
    });
}

test('FMMD and FMID render the same logical point-key set', () => {
    assert.deepEqual(new Set(allVisibleKeys('FMMD')), new Set(allVisibleKeys('FMID')));
});

test('balance rules only define and reference rendered point keys', () => {
    const renderedKeys = new Set(allVisibleKeys('FMMD'));
    const balanceRules = loadBalanceRules();

    Object.entries(balanceRules).forEach(([key, rules]) => {
        assert.ok(renderedKeys.has(key), `Balance rule key is not rendered: ${key}`);
        Object.entries(rules).forEach(([ruleName, values]) => values.forEach(value => {
            assert.ok(renderedKeys.has(value), `${key} ${ruleName} references a non-rendered key: ${value}`);
        }));
    });
});

test('guides only reference rendered point keys and have no duplicates', () => {
    const renderedKeys = new Set(allVisibleKeys('FMMD'));

    loadGuideGroups().flatMap(group => group.guides).forEach(guide => {
        const keys = guide.keys || [];
        assert.equal(new Set(keys).size, keys.length, `${guide.name} contains duplicate point keys.`);
        keys.forEach(key => assert.ok(renderedKeys.has(key), `${guide.name} references a non-rendered key: ${key}`));
    });
});

test('treatment numbers are clamped and stored as two digits', () => {
    const { normalizeTreatmentNumber } = loadNormalizers();

    assert.equal(normalizeTreatmentNumber(), '01');
    assert.equal(normalizeTreatmentNumber(0), '01');
    assert.equal(normalizeTreatmentNumber('3'), '03');
    assert.equal(normalizeTreatmentNumber(10), '10');
    assert.equal(normalizeTreatmentNumber(99), '10');
});

test('treatment data preserves valid values and rejects invalid values', () => {
    const { normalizeTreatmentData } = loadNormalizers();

    assert.deepEqual(normalizeTreatmentData(undefined, '++'), { result: '++', comment: '' });
    assert.deepEqual(normalizeTreatmentData({ result: '--', comment: 'Improved\nNext visit' }), { result: '--', comment: 'Improved\nNext visit' });
    assert.throws(() => normalizeTreatmentData({ result: 'clear' }), /Invalid treatment result/);
    assert.throws(() => normalizeTreatmentData({ result: '+', comment: 1 }), /Expected treatment comment to be text/);
    assert.throws(() => normalizeTreatmentData([]), /Expected treatment to be an object/);
});

test('pain history accepts valid entries and rejects malformed entries', () => {
    const { validatePainHistory } = loadNormalizers();
    const history = { 'anterior:CU1': { type: 'SiPa', side: 'LT', age: '1y' } };

    assert.deepEqual(validatePainHistory(undefined), {});
    assert.deepEqual(validatePainHistory(history), history);
    assert.throws(() => validatePainHistory([]), /Expected painHistory to be a location map/);
    assert.throws(() => validatePainHistory({ 'side:CU1': history['anterior:CU1'] }), /Invalid painHistory entry/);
    assert.throws(() => validatePainHistory({ 'anterior:CU1': { type: 'Other', side: 'LT', age: '1y' } }), /Invalid painHistory entry/);
    assert.throws(() => validatePainHistory({ 'anterior:CU1': { type: 'SiPa', side: 'LT', age: '99y' } }), /Invalid painHistory entry/);
});

test('patient imports normalize visits, legacy results, and detail fields', () => {
    const { normalizePatients } = loadNormalizers();
    const patients = normalizePatients({
        Ada: {
            visits: {
                2: {
                    treatmentResult: '+',
                    patientDetails: { occupation: 'Teacher', ignored: 'discarded' },
                    painHistory: { 'posterior:CU2': { type: 'PaConc', side: 'BI', age: '3m' } }
                }
            }
        },
        ' ': { visits: {} },
        Invalid: []
    });

    assert.deepEqual(patients, {
        Ada: {
            visits: {
                '02': {
                    treatment: { result: '+', comment: '' },
                    patientDetails: { occupation: 'Teacher' },
                    painHistory: { 'posterior:CU2': { type: 'PaConc', side: 'BI', age: '3m' } }
                }
            }
        }
    });
    assert.throws(() => normalizePatients({ Ada: { visits: { 1: { bodyHistory: {} } } } }), /Invalid visit/);
});