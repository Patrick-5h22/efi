import { lancerNavigateur, BASE, artefact } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let pass = 0, fail = 0;
const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${x ? ' — ' + x : ''}`); };

await page.goto(BASE + '/');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);

// 0. On sème une séance qui mord sur 12:00–13:00, pour que l'avertissement
// d'activation ait quelque chose à compter.
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.inscriptions.push({ id: st.nextId++, stagiaire: 'MORD Surlapause', formation: 'HAB-ELEC',
    type: 'Initial', statut: 'confirmee', modeTheorie: 'distance',
    datePratique: '2026-09-02', debutPratique: 660 }); // 11:00 → 13:00
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});
await page.reload(); await page.waitForTimeout(600);

// 1. Paramètres : la pause existe et est décochée
await page.goto(BASE + '/#/parametres'); await page.waitForTimeout(600);
const box = page.locator('[data-p="pauseActive"]');
check('case « pause déjeuner » présente', await box.count() === 1);
check('décochée par défaut', await box.isChecked() === false);
check('bornes 12:00 / 13:00', await page.inputValue('[data-p="pauseDebut"]') === '12:00'
  && await page.inputValue('[data-p="pauseFin"]') === '13:00');

// 2. Avertissement AVANT activation, chiffré
const avant = await page.locator('#main').innerText();
check('avertissement chiffré avant activation',
  /Activer la pause ferait basculer/.test(avant) && /inscription\(s\)/.test(avant), '');

// 3. Grille : pas de pause tant que c'est inactif
await page.goto(BASE + '/#/semaine'); await page.waitForTimeout(600);
check('aucune cellule PAUSE tant que c’est inactif', await page.locator('td.slot-pause').count() === 0);
const libresAvant = await page.locator('td.slot-free').count();

// 4. Activation
await page.goto(BASE + '/#/parametres'); await page.waitForTimeout(500);
await page.locator('[data-p="pauseActive"]').check(); await page.waitForTimeout(700);
check('état persisté', await page.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).params.pauseActive === true));
const apres = await page.locator('#main').innerText();
check('le message bascule au présent après activation',
  /sont signalées en anomalie/.test(apres) && !/ferait basculer/.test(apres), '');

// 5. Grille : la pause se voit, et mange des créneaux libres
await page.goto(BASE + '/#/semaine'); await page.waitForTimeout(700);
const nbPause = await page.locator('td.slot-pause').count();
check('cellules PAUSE peintes', nbPause > 0, `${nbPause}`);
const libresApres = await page.locator('td.slot-free').count();
check('des créneaux libres deviennent la pause', libresApres < libresAvant, `${libresAvant} → ${libresApres}`);
check('légende « Pause déjeuner »', (await page.locator('.legend').innerText()).includes('Pause déjeuner'));
check('hachures, pas une couleur pleine', await page.locator('td.slot-pause').first().evaluate(
  (el) => getComputedStyle(el).backgroundImage.includes('gradient')));

// 6. Planning global
await page.goto(BASE + '/#/planning-formateur'); await page.waitForTimeout(900);
check('pause visible sur le planning global', await page.locator('td.slot-pause').count() > 0);

// 7. Saisie guidée : les créneaux qui mordent sur la pause ne sont plus proposés
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(500);
await page.click('#btn-add'); await page.waitForTimeout(400);
await page.fill('input[name=stagiaire]', 'TEST Pause');
await page.selectOption('select[name=formation]', 'HAB-ELEC'); await page.waitForTimeout(300);
await page.selectOption('select[name=datePratique]', '2026-09-02'); await page.waitForTimeout(500);
const heures = await page.locator('select[name=debutPratique] option').evaluateAll(
  (o) => o.map((x) => x.value).filter(Boolean));
check('aucun départ proposé ne mord sur la pause',
  heures.every((h) => { const t = Number(h); return !(t < 780 && t + 120 > 720); }),
  heures.join(','));
check('des créneaux restent proposés', heures.length > 0, `${heures.length}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// 8. Anomalie sur une séance qui chevauche
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(600);
check('anomalie « chevauche la pause déjeuner »',
  (await page.locator('table.data').innerText()).includes('pause déjeuner'));

await page.goto(BASE + '/#/semaine'); await page.waitForTimeout(600);
await page.screenshot({ path: artefact('pause-semaine.png'), fullPage: true });

check('aucune erreur JS', errors.length === 0, errors.join(' ; '));
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close(); process.exit(fail ? 1 : 0);
