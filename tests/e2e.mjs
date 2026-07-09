// Test de bout en bout (optionnel — nécessite Playwright et un serveur local) :
//   python3 -m http.server 8080 &
//   node tests/e2e.mjs [chemin-chromium]
// Scénario : réinitialisation, ouverture d'un jour EFI, réservation depuis la
// grille semaine, vérification synthèse + planning, détection d'un conflit.

import { chromium } from 'playwright';

const executablePath = process.argv[2] || process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.BASE_URL || 'http://localhost:8080';

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('dialog', (d) => d.accept());

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

// 1. État vierge avec exemples
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(400);

// 2. Ouvrir un jour EFI supplémentaire (jeudi 03/09)
await page.goto(`${BASE}/#/jours`);
await page.waitForTimeout(300);
await page.click('[data-toggle="2026-09-03"]');
await page.waitForTimeout(300);
check('jour 03/09 ouvert', await page.locator('[data-toggle="2026-09-03"].cal-open').count() === 1);

// 3. Réserver depuis la grille semaine 36 (créneau libre du 03/09)
await page.goto(`${BASE}/#/semaine/36`);
await page.waitForTimeout(300);
await page.locator('td.slot-free[data-date="2026-09-03"][data-kind="F"]').first().click();
await page.fill('input[name=stagiaire]', 'E2E DUPONT Test');
await page.selectOption('select[name=formation]', 'HAB-ELEC');
await page.waitForTimeout(300);
check('formulaire prérempli (date 03/09)', await page.locator('select[name=datePratique]').inputValue() === '2026-09-03');
check('aperçu sans conflit', (await page.locator('#form-preview').innerText()).includes('OK'));
await page.click('#btn-save');
await page.waitForTimeout(300);

// 4. La réservation apparaît sur la grille et dans la synthèse
await page.goto(`${BASE}/#/semaine/36`);
await page.waitForTimeout(300);
check('créneau occupé sur la grille', (await page.locator('#main').innerText()).includes('E2E DUPONT Test'));
await page.goto(`${BASE}/#/synthese/36`);
await page.waitForTimeout(300);
check('présent dans la synthèse', (await page.locator('#main').innerText()).includes('E2E DUPONT Test'));
await page.goto(`${BASE}/#/planning-formateur`);
await page.waitForTimeout(300);
check('présent dans le planning formateur', (await page.locator('#main').innerText()).includes('E2E DUPONT Test'));

// 5. Créer un conflit volontaire : même formateur, autre catégorie, même créneau
await page.goto(`${BASE}/#/inscriptions`);
await page.waitForTimeout(300);
await page.click('#btn-add');
await page.fill('input[name=stagiaire]', 'E2E Conflit');
await page.selectOption('select[name=formation]', 'R486-A');
await page.selectOption('select[name=datePratique]', '2026-09-03');
await page.selectOption('select[name=debutPratique]', '510');
await page.waitForTimeout(400);
const preview = await page.locator('#form-preview').innerText();
check('conflit détecté à la saisie', preview.includes('anomalie'));
await page.click('#btn-save'); // on enregistre malgré tout
await page.waitForTimeout(300);
const nav = await page.locator('#nav').innerText();
check('badge d\'anomalies dans la navigation', /Inscriptions\s*\d/.test(nav));

// 6. Undo : la ligne en conflit disparaît
await page.click('#btn-undo');
await page.waitForTimeout(300);
check('undo retire la ligne', !(await page.locator('#main').innerText()).includes('E2E Conflit'));

check('aucune erreur JavaScript', errors.length === 0);
if (errors.length) console.log('Erreurs :', errors.join('\n'));

await browser.close();
process.exit(failures ? 1 : 0);
