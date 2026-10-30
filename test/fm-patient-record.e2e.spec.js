const { expect, test } = require('@playwright/test');

async function createPatient(page, name = 'Test Patient') {
    await page.goto('/fm-patient-record.html');
    await page.locator('#patient-search').fill(name);
    await page.locator('#create-patient').click();
    await expect(page.locator('#state-dialog')).not.toHaveAttribute('open', '');
}

async function openStateDialog(page) {
    await page.locator('.clear-button').click();
    await expect(page.locator('#state-dialog')).toHaveAttribute('open', '');
}

async function markPointGreen(page, key) {
    const point = page.locator(`.point[data-key="${key}"]`);
    const box = await point.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2 - 28);
    await page.mouse.up();
    await expect(point).toHaveClass(/palpation-green/);
}

async function markPoint(page, key, deltaY, expectedClass) {
    const point = page.locator(`.point[data-key="${key}"]`);
    const box = await point.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2 + deltaY);
    await page.mouse.up();
    await expect(point).toHaveClass(expectedClass);
}

const pointColors = {
    grey: { deltaY: 20, className: /palpation-grey/ },
    yellow: { deltaY: 0, className: /palpation-yellow/ },
    green: { deltaY: -32, className: /palpation-green/ },
    red: { deltaY: -64, className: /palpation-red/ }
};

async function clearPoint(page, key) {
    const point = page.locator(`.point[data-key="${key}"]`);
    const box = await point.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 36);
    await page.mouse.up();
    await expect(point).not.toHaveClass(/palpation-(grey|yellow|green|red)/);
}

async function switchLayout(page, layout) {
    const trigger = page.locator('.clear-button');
    const triggerBox = await trigger.boundingBox();
    await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2 + 20);
    await expect(page.locator('#guide-dialog')).toHaveAttribute('open', '');

    const target = page.locator(`button[data-layout="${layout}"]`);
    const targetBox = await target.boundingBox();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.up();
    await expect(page).toHaveURL(new RegExp(`#${layout}$`));
}

async function setBodyHistory(page, rowName, side, type, ageIndex) {
    const label = page.locator(`.row-label[data-row-name="${rowName}"]:not(.row-label-right)`);
    const box = await label.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20);
    await expect(page.locator('#history-dialog')).toHaveAttribute('open', '');
    const target = page.locator(`button[data-history-side="${side}"][data-history-type="${type}"][data-history-age="${ageIndex}"]`);
    const targetBox = await target.boundingBox();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.up();
}

test('creates a patient, saves details, and keeps visits separate', async ({ page }) => {
    await createPatient(page);
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Teacher');
    await page.locator('#history').fill('Shoulder discomfort');
    await page.locator('#close-patient-details').click();

    await page.locator('.treatment-number-button').click();
    await page.locator('button[data-treatment-number="02"]').click();
    await expect(page.locator('.treatment-number-button')).toHaveText('02');
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Designer');
    await page.locator('#close-patient-details').click();

    const visits = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits);
    expect(visits['01'].patientDetails.occupation).toBe('Teacher');
    expect(visits['01'].patientDetails.history).toBe('Shoulder discomfort');
    expect(visits['02'].patientDetails.occupation).toBe('Designer');
});

test('marks a point, records its treatment result, and restores it after reload', async ({ page }) => {
    await createPatient(page);
    const key = 'an-cp1-lt';
    await markPointGreen(page, key);
    await page.locator(`.point[data-key="${key}"]`).click();
    await page.locator('#treatment-result-dialog button[data-treatment-result="++"]').click();
    await expect(page.locator(`.point[data-key="${key}"] .point-treatment-result`)).toHaveText('+2');

    await page.reload();
    await expect(page.locator(`.point[data-key="${key}"]`)).toHaveClass(/palpation-green/);
    await expect(page.locator(`.point[data-key="${key}"] .point-treatment-result`)).toHaveText('+2');
});

test('clearing a point also removes its saved treatment result', async ({ page }) => {
    await createPatient(page);
    const key = 'an-cp1-lt';
    await markPointGreen(page, key);
    await page.locator(`.point[data-key="${key}"]`).click();
    await page.locator('#treatment-result-dialog button[data-treatment-result="++"]').click();
    await clearPoint(page, key);

    await expect(page.locator(`.point[data-key="${key}"] .point-treatment-result`)).toHaveText('');
    const savedPoints = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits['01'].points);
    expect(savedPoints[key]).toBeUndefined();
});

test('stores body-history selections and clears individual history', async ({ page }) => {
    await createPatient(page);
    await setBodyHistory(page, 'CP1', 'BI', 'SiPa', 3);
    await expect(page.locator('.row-label[data-row-name="CP1"]').first()).toHaveClass(/history-marked/);

    await page.reload();
    let history = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits['01'].painHistory);
    expect(history['anterior:CP1']).toEqual({ type: 'SiPa', side: 'BI', age: '1y' });

    const label = page.locator('.row-label[data-row-name="CP1"]:not(.row-label-right)');
    const box = await label.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20);
    const clearButton = page.locator('#clear-body-history');
    const clearBox = await clearButton.boundingBox();
    await page.mouse.move(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
    await page.mouse.up();
    history = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits['01'].painHistory);
    expect(history['anterior:CP1']).toBeUndefined();
});

test('clears all saved body-history markers', async ({ page }) => {
    await createPatient(page);
    await setBodyHistory(page, 'CP1', 'LT', 'SiPa', 0);
    await setBodyHistory(page, 'CP2', 'RT', 'PaConc', 1);
    await expect(page.locator('.row-label.history-marked')).toHaveCount(2);

    await page.evaluate(() => clearAllBodyHistory());
    await expect(page.locator('.row-label.history-marked')).toHaveCount(0);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits['01'].painHistory);
    expect(history).toEqual({});
});

test('saves and safely renders overall treatment comments', async ({ page }) => {
    await createPatient(page);
    await page.locator('.treatment-result-button').click();
    await page.locator('#treatment-comment').fill('Improved\n![scan](https://example.test/scan.png)\n<script>alert(1)</script>');
    await page.locator('#treatment-comment-actions button[data-treatment-result="++"]').click();
    await page.locator('#toggle-treatment-comment').click();

    await expect(page.locator('#treatment-comment-display')).toContainText('Improved');
    await expect(page.locator('#treatment-comment-display img')).toHaveAttribute('src', 'https://example.test/scan.png');
    await expect(page.locator('#treatment-comment-display script')).toHaveCount(0);
    await expect(page.locator('#treatment-comment-display')).toContainText('<script>alert(1)</script>');
    const treatment = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients'))['Test Patient'].visits['01'].treatment);
    expect(treatment).toEqual({ result: '++', comment: 'Improved\n![scan](https://example.test/scan.png)\n<script>alert(1)</script>' });
});

test('keeps point state when switching between FMMD and FMID', async ({ page }) => {
    await createPatient(page);
    const key = 'an-cp1-lt';
    await markPointGreen(page, key);
    await switchLayout(page, 'fmid');

    await expect(page.locator(`.point[data-key="${key}"]`)).toHaveClass(/palpation-green/);
    await expect(page.locator('button[data-layout="fmid"]')).toHaveAttribute('aria-pressed', 'true');
});

test('renames and removes patients while clearing current and all visits', async ({ page }) => {
    await createPatient(page, 'Original Patient');
    await page.locator('.patient-details-button').click();
    await page.locator('#patient_name').fill('Renamed Patient');
    await page.locator('#patient_name').press('Tab');
    await page.locator('#close-patient-details').click();

    let patients = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients')));
    expect(patients['Original Patient']).toBeUndefined();
    expect(patients['Renamed Patient'].visits['01']).toBeDefined();

    await openStateDialog(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-current').click();
    patients = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients')));
    expect(patients['Renamed Patient'].visits['01']).toEqual({ points: {} });

    await page.locator('.treatment-number-button').click();
    await page.locator('button[data-treatment-number="02"]').click();
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Designer');
    await page.locator('#close-patient-details').click();
    await openStateDialog(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-all-visits').click();
    patients = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients')));
    expect(patients['Renamed Patient'].visits).toEqual({ '1': { points: {} } });

    await openStateDialog(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#remove-patient').click();
    patients = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients')));
    expect(patients['Renamed Patient']).toBeUndefined();
});

test('exports and imports a patient record with point state', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
    await createPatient(page, 'Export Patient');
    await markPointGreen(page, 'an-cp1-lt');
    await openStateDialog(page);
    await page.locator('#export-json').click();
    const exported = await page.evaluate(() => navigator.clipboard.readText());

    await page.addInitScript(() => localStorage.clear());
    await page.reload();
    await page.evaluate(text => navigator.clipboard.writeText(text), exported);
    await expect(page.locator('#patient-search-options')).toBeHidden();
    await page.locator('#import-json').click();

    await expect(page.locator('.point[data-key="an-cp1-lt"]')).toHaveClass(/palpation-green/);
    await expect(page.locator('#patient_name')).toHaveValue('Export Patient');
});

test('exports and imports color-specific point lists', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
    await createPatient(page);
    await markPoint(page, 'an-cp1-lt', 0, /palpation-yellow/);
    await markPointGreen(page, 'an-cp1-rt');
    await openStateDialog(page);
    await page.locator('#export-yellow-points').click();
    const yellowPoints = await page.evaluate(() => navigator.clipboard.readText());

    await clearPoint(page, 'an-cp1-lt');
    await openStateDialog(page);
    await page.evaluate(text => navigator.clipboard.writeText(text), yellowPoints);
    await page.locator('#import-yellow-points').click();
    await expect(page.locator('.point[data-key="an-cp1-lt"]')).toHaveClass(/palpation-yellow/);
    await expect(page.locator('.point[data-key="an-cp1-rt"]')).toHaveClass(/palpation-green/);
});

test('round-trips every point color without changing the others', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
    await createPatient(page);
    const keys = ['an-cp1-lt', 'an-cp1-rt', 're-cp1-lt', 're-cp1-rt'];

    for (const [index, color] of Object.keys(pointColors).entries()) {
        const { deltaY, className } = pointColors[color];
        await markPoint(page, keys[index], deltaY, className);
        await openStateDialog(page);
        await page.locator(`#export-${color}-points`).click();
        const exported = await page.evaluate(() => navigator.clipboard.readText());

        if (color !== 'grey') await clearPoint(page, keys[index]);
        await openStateDialog(page);
        await page.evaluate(text => navigator.clipboard.writeText(text), exported);
        await page.locator(`#import-${color}-points`).click();
        await expect(page.locator(`.point[data-key="${keys[index]}"]`)).toHaveClass(className);
    }

    for (const [index, color] of Object.keys(pointColors).entries()) {
        await expect(page.locator(`.point[data-key="${keys[index]}"]`)).toHaveClass(pointColors[color].className);
    }
});

test('rejects malformed patient, storage, and point-list imports without changing data', async ({ page }) => {
    await createPatient(page);
    await markPointGreen(page, 'an-cp1-lt');
    await openStateDialog(page);

    for (const [button, clipboardText, expectedMessage] of [
        ['#import-json', '{invalid', 'Unable to import patient JSON'],
        ['#import-all-json', '{}', 'Unable to import storage JSON'],
        ['#import-green-points', 'not-json', 'Unable to import green points']
    ]) {
        await page.evaluate(text => { navigator.clipboard.readText = async () => text; }, clipboardText);
        const dialogPromise = page.waitForEvent('dialog');
        await page.locator(button).evaluate(element => window.setTimeout(() => element.click(), 0));
        const dialog = await dialogPromise;
        expect(dialog.message()).toContain(expectedMessage);
        await dialog.accept();
    }

    await expect(page.locator('.point[data-key="an-cp1-lt"]')).toHaveClass(/palpation-green/);
});

test('loads patients from search results without mixing their visit data', async ({ page }) => {
    await createPatient(page, 'Alpha Patient');
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Alpha role');
    await page.locator('#close-patient-details').click();

    await openStateDialog(page);
    await page.locator('#patient-search').fill('Beta Patient');
    await page.locator('#create-patient').click();
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Beta role');
    await page.locator('#close-patient-details').click();

    await openStateDialog(page);
    await page.locator('#patient-search').fill('Alpha');
    await page.locator('#patient-search-options button[role="option"]').click();
    await page.locator('.patient-details-button').click();
    await expect(page.locator('#patient_name')).toHaveValue('Alpha Patient');
    await expect(page.locator('#occupation')).toHaveValue('Alpha role');
    await page.locator('#close-patient-details').click();
});

test('exports and restores all storage with multiple patients and visits', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
    await createPatient(page, 'Storage Alpha');
    await markPointGreen(page, 'an-cp1-lt');
    await page.locator('.treatment-number-button').click();
    await page.locator('button[data-treatment-number="02"]').click();
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Second visit');
    await page.locator('#close-patient-details').click();

    await openStateDialog(page);
    await page.locator('#patient-search').fill('Storage Beta');
    await page.locator('#create-patient').click();
    await page.locator('.patient-details-button').click();
    await page.locator('#occupation').fill('Other patient');
    await page.locator('#close-patient-details').click();
    await openStateDialog(page);
    await page.locator('#export-all-json').click();
    const exported = await page.evaluate(() => navigator.clipboard.readText());

    await page.addInitScript(() => localStorage.clear());
    await page.reload();
    await page.evaluate(text => navigator.clipboard.writeText(text), exported);
    await page.locator('#import-all-json').click();

    await expect(page.locator('#patient_name')).toHaveValue('Storage Beta');
    const patients = await page.evaluate(() => JSON.parse(localStorage.getItem('fm-patient-record-patients')));
    expect(patients['Storage Alpha'].visits['01'].points['an-cp1-lt'].palpation).toBe(2);
    expect(patients['Storage Alpha'].visits['02'].patientDetails.occupation).toBe('Second visit');
    expect(patients['Storage Beta'].visits['01'].patientDetails.occupation).toBe('Other patient');
});

test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('can create a patient and mark then clear a point', async ({ page }) => {
        await createPatient(page, 'Mobile Patient');
        await markPointGreen(page, 'an-cp1-lt');
        await clearPoint(page, 'an-cp1-lt');
    });
});

test('exposes labeled controls and reachable keyboard focus', async ({ page }) => {
    await page.goto('/fm-patient-record.html');
    await expect(page.locator('#state-dialog')).toHaveAttribute('aria-label', 'Patient administration');
    await expect(page.locator('#patient-search')).toHaveAttribute('aria-label', 'Patient name');
    await expect(page.locator('#create-patient')).toHaveAttribute('aria-label', 'Create patient');
    await expect(page.locator('#guide-dialog')).toHaveAttribute('aria-labelledby', 'guide-dialog-title');
    await expect(page.locator('#history-dialog')).toHaveAttribute('aria-labelledby', 'history-dialog-title');

    await page.locator('#patient-search').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#create-patient')).toBeFocused();
});