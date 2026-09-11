// Catalogue paramétrable : créer, modifier et retirer une formation depuis
// Paramètres, sans intervention technique.
import { lancerNavigateur, BASE } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const confirmed = true;
page.on('dialog', (d) => confirmed ? d.accept() : d.dismiss());
let pass = 0, fail = 0;
const check = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${extra ? ' — ' + extra : ''}`); };

await page.goto(BASE + '/');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(700);

// 1. R485 livrées d'office
await page.goto(BASE + '/#/parametres'); await page.waitForTimeout(500);
const cat = await page.locator('#main').innerText();
check('R485 Cat 1 et Cat 2 au catalogue', cat.includes('R485-1') && cat.includes('R485-2'));
check('colonne « Charge comptée » présente', cat.includes('Charge comptée'));

// 2. Création d'un produit depuis l'interface
await page.fill('#nf-code', 'r482-b');
await page.fill('#nf-label', 'Pratique R482 Cat B');
await page.fill('#nf-reco', 'r482');
await page.fill('#nf-init', '2');
await page.fill('#nf-recy', '1.5');
await page.click('#btn-add-formation'); await page.waitForTimeout(500);
const afterAdd = await page.locator('#main').innerText();
check('formation créée, code normalisé en majuscules', afterAdd.includes('R482-B'), '');
check('recommandation normalisée', await page.locator('input[data-f$="|reco"]').last().inputValue() === 'R482');

// 3. Code en double refusé
await page.fill('#nf-code', 'R482-B');
await page.fill('#nf-label', 'Doublon');
await page.fill('#nf-reco', 'R482');
await page.click('#btn-add-formation'); await page.waitForTimeout(400);
check('code en double refusé', (await page.locator('#toast-zone').innerText()).includes('existe déjà'));

// 4. Le nouveau produit alimente automatiquement l'onglet Équipe
await page.goto(BASE + '/#/equipe'); await page.waitForTimeout(400);
check('colonnes F/T créées dans Équipe', (await page.locator('#main').innerText()).includes('R482-B'));
const nQual = await page.locator('input[data-qual*="R482-B"]').count();
check('deux cases (F et T) par intervenant', nQual >= 4, `${nQual} cases`);

// 5. Le produit est proposé à l'inscription
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(400);
await page.click('#btn-add'); await page.waitForTimeout(400);
const opts = await page.locator('select[name=formation] option').allInnerTexts();
check('produit proposé dans le formulaire', opts.some((o) => o.includes('R482 Cat B')));
check('R485 proposées aussi', opts.some((o) => o.includes('R485 Cat 1')));
await page.selectOption('select[name=formation]', 'R482-B'); await page.waitForTimeout(400);
check('durée initiale reprise (02h00)', (await page.locator('#duree-info').innerText()).includes('02h00'));
await page.click('#btn-cancel').catch(() => page.keyboard.press('Escape'));
await page.waitForTimeout(300);

// 6. Suppression protégée quand le produit est utilisé
await page.goto(BASE + '/#/parametres'); await page.waitForTimeout(400);
const rowsBefore = await page.locator('[data-del-formation]').count();
// R489-1A est utilisée par les exemples du classeur
const idxUsed = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  return st.formations.findIndex((f) => f.code === 'R489-1A');
});
await page.locator(`[data-del-formation="${idxUsed}"]`).click(); await page.waitForTimeout(400);
check('suppression refusée si des inscriptions l’utilisent', (await page.locator('#toast-zone').innerText()).includes('inscription'));
check('catalogue inchangé', await page.locator('[data-del-formation]').count() === rowsBefore);

// 7. Suppression d'un produit inutilisé
const idxFree = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  return st.formations.findIndex((f) => f.code === 'R482-B');
});
await page.locator(`[data-del-formation="${idxFree}"]`).click(); await page.waitForTimeout(500);
check('produit inutilisé retiré', !(await page.locator('#main').innerText()).includes('R482-B'));
await page.goto(BASE + '/#/equipe'); await page.waitForTimeout(400);
check('colonnes d’habilitation retirées d’Équipe', !(await page.locator('#main').innerText()).includes('R482-B'));

// 8. Charge comptée : décocher sort la formation du plafond
await page.goto(BASE + '/#/parametres'); await page.waitForTimeout(400);
const habIdx = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  return st.formations.findIndex((f) => f.code === 'HAB-ELEC');
});
await page.locator(`input[data-f="${habIdx}|chargeComptee"]`).uncheck(); await page.waitForTimeout(400);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'HAB-ELEC').chargeComptee);
check('paramètre « charge comptée » persisté', stored === false, String(stored));

// 9. Bascule en « épreuve surveillée »
await page.selectOption(`select[data-f="${habIdx}|testOnly"]`, '1'); await page.waitForTimeout(500);
const afterType = await page.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'HAB-ELEC'));
check('séance passée en épreuve surveillée', afterType.testOnly === true);
check('tests séparés désactivés automatiquement', afterType.tests === false);

check('aucune erreur JS', errors.length === 0, errors.join(' ; '));
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close();
process.exit(fail ? 1 : 0);
