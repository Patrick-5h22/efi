// Volet gestion : n° de dossier YPAREO et chiffre d'affaires — portés par le
// PARCOURS et non par la séance —, écran de suivi du CA, export YPAREO.
import { lancerNavigateur, BASE, artefact } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let pass = 0, fail = 0;
const check = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${extra ? ' — ' + extra : ''}`); };

await page.goto(BASE + '/');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);

// 1. Saisie du dossier et du CA sur une inscription
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(400);
await page.click('#btn-add'); await page.waitForTimeout(400);
await page.fill('input[name=stagiaire]', 'NEAU Emmanuel');
await page.fill('input[name=dossierYpareo]', '0123456789');
await page.fill('input[name=chiffreAffaires]', '1250');
await page.selectOption('select[name=formation]', 'HAB-ELEC'); await page.waitForTimeout(300);
// Premier jour OUVERT proposé, et non une date écrite en clair : les jours
// ouverts d'une installation neuve suivent la fenêtre glissante (seize
// semaines depuis la semaine en cours), ils ne sont plus datés en dur.
const jour = await page.locator('select[name=datePratique] option').evaluateAll(
  (opts) => opts.map((o) => o.value).filter((v) => v)[0]);
await page.selectOption('select[name=datePratique]', jour); await page.waitForTimeout(400);
// Premier créneau réellement proposé (les exemples du classeur en occupent déjà)
const creneau = await page.locator('select[name=debutPratique] option').evaluateAll(
  (opts) => opts.map((o) => o.value).filter((v) => v)[0]);
await page.selectOption('select[name=debutPratique]', creneau); await page.waitForTimeout(400);
await page.click('#btn-save'); await page.waitForTimeout(500);

const stored = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const i = st.inscriptions.find((x) => x.stagiaire === 'NEAU Emmanuel');
  return { ...i, parcours: st.parcours.find((p) => p.id === i?.parcoursId) };
});
check('un parcours est créé avec la ligne', !!stored?.parcours, String(stored?.parcoursId));
check('n° de dossier enregistré sur le parcours',
  stored?.parcours?.dossierYpareo === '0123456789', String(stored?.parcours?.dossierYpareo));
check('CA enregistré en nombre sur le parcours',
  stored?.parcours?.chiffreAffaires === 1250, String(stored?.parcours?.chiffreAffaires));
check('la ligne ne porte plus le montant',
  !('chiffreAffaires' in (stored || {})), JSON.stringify(Object.keys(stored || {}).slice(0, 4)));

// 2. Colonnes visibles dans la liste
const listText = await page.locator('table.data').innerText();
check('colonne N° dossier dans la liste', listText.includes('0123456789'));
check('montant formaté en euros', /1\s?250/.test(listText) && listText.includes('€'), '');

// 3. Recherche par n° de dossier
await page.fill('#f-search', '0123456789'); await page.waitForTimeout(400);
const filtered = await page.locator('table.data tbody tr').count();
check('recherche par n° de dossier', filtered === 1, `${filtered} ligne(s)`);
await page.fill('#f-search', ''); await page.waitForTimeout(400);

// 4. Réouverture : les champs sont repris
await page.locator(`[data-edit="${stored.id}"]`).click(); await page.waitForTimeout(400);
check('dossier repris à l’édition', await page.inputValue('input[name=dossierYpareo]') === '0123456789');
check('CA repris à l’édition', await page.inputValue('input[name=chiffreAffaires]') === '1250');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// 5. Écran de suivi du CA
await page.goto(BASE + '/#/ca'); await page.waitForTimeout(600);
const ca = await page.locator('#main').innerText();
check('écran CA accessible', ca.includes('Chiffre d’affaires'));
// Le libellé du mois est LU dans l'état, jamais écrit en clair : les jours
// ouverts d'une installation neuve suivent la fenêtre glissante, et le test
// est tombé tout seul le jour où le calendrier a passé septembre.
const moisAttendu = await page.evaluate(async () => {
  const { moisLabel } = await import('/js/ca.js');
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const i = st.inscriptions.find((x) => x.stagiaire === 'NEAU Emmanuel');
  return moisLabel(i.datePratique.slice(0, 7));
});
check(`bloc mensuel « ${moisAttendu} »`, ca.includes(moisAttendu), moisAttendu);
check('sous-total mensuel', ca.includes('Sous-total'));
check('total par recommandation', ca.includes('Total par recommandation'));
check('KPI dossier', ca.includes('dossier(s) YPAREO'));
check('lien de navigation présent', (await page.locator('#nav').innerText()).includes('Chiffre d’affaires'));

// 6. Une seconde catégorie rattachée au MÊME parcours ne double pas le CA.
//    C'est tout l'objet du parcours : avant, ce cas donnait 2 500 € et un
//    avertissement « montant répété » qu'aucun code ne savait corriger.
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const src = st.inscriptions.find((i) => i.stagiaire === 'NEAU Emmanuel');
  st.inscriptions.push({ ...src, id: st.nextId++, formation: 'R489-3', debutPratique: 600 });
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});
await page.reload(); await page.waitForTimeout(500);
await page.goto(BASE + '/#/ca'); await page.waitForTimeout(600);
const ca2 = await page.locator('#main').innerText();
check('deux séances, un seul montant compté', /1\s?250/.test(ca2) && !/2\s?500/.test(ca2),
  ca2.split('\n').filter((l) => /€/.test(l)).slice(0, 3).join(' / '));
check('le compteur dit bien « parcours » et « séances »',
  ca2.includes('parcours facturé(s)') && ca2.includes('séance(s) couverte(s)'), '');
check('plus d’avertissement « montant répété » — la cause a disparu',
  !ca2.includes('répété'), '');
await page.locator('.card').first().screenshot({ path: artefact('ca-ecran.png') }).catch(() => {});
await page.screenshot({ path: artefact('ca-page.png'), fullPage: true });

// 7. Sélecteur d'année
const annees = await page.locator('#ca-annee option').allInnerTexts();
check('sélecteur d’année alimenté', annees.includes('2026'), annees.join(','));

// 8. Export YPAREO : une ligne par parcours, catégories en champ texte
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(500);
check('le bouton YPAREO existe', await page.locator('#btn-ypareo').count() === 1);

const ypareo = await page.evaluate(async () => {
  const { lignesYpareo, ypareoCSV } = await import('/js/ypareo.js');
  const { migrate } = await import('/js/store.js');
  const st = migrate(JSON.parse(localStorage.getItem('efi-planning-v1')));
  return { lignes: lignesYpareo(st), csv: ypareoCSV(st) };
});
const vente = ypareo.lignes.find((l) => l.stagiaire === 'NEAU Emmanuel');
check('une seule ligne pour les deux catégories', !!vente && vente.seances === 2,
  JSON.stringify(ypareo.lignes.map((l) => [l.stagiaire, l.seances])));
check('la colonne Formation porte les recommandations',
  /HAB ELEC|R489/.test(vente?.formation || ''), vente?.formation);
check('les catégories partent en commentaire',
  /Cat\. 3/.test(vente?.commentaire || ''), vente?.commentaire);
check('le CSV porte l’en-tête attendu',
  ypareo.csv.includes('"Commentaire"') && ypareo.csv.includes('"N° dossier YPAREO"'), '');

check('aucune erreur JS', errors.length === 0, errors.join(' ; '));
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close();
process.exit(fail ? 1 : 0);
