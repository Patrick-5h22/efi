// Les deux modalités AIPR, et la durée de test par formation, vues depuis
// l'écran Paramètres.
//
// Les tests unitaires couvrent le moteur et le catalogue. Ce qu'ils ne voient
// pas : la liste « Séance » offre-t-elle bien les trois modalités, la colonne
// « Durée test » existe-t-elle, ce qu'on y saisit part-il dans l'état, un champ
// vidé retombe-t-il sur la durée générale, et le changement de modalité
// remanie-t-il la ligne ? Deux défauts de cette session sont passés par ce
// trou — un lien de barre latérale et une cellule non cliquable, tous deux
// invisibles aux tests unitaires.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1700, height: 1100 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

await p.goto(BASE + '/#/parametres');
await p.reload();
await p.waitForTimeout(900);

// --- Le catalogue livré ---------------------------------------------------

const entetes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data thead th')].map((t) => t.textContent.trim()));
check('la colonne « Durée test » existe', entetes.includes('Durée test (h)'),
  entetes.join(' | '));

const lignes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data tbody tr')].map((tr) => ({
    code: tr.querySelector('td b')?.textContent.trim(),
    modalite: tr.querySelector('select[data-f$="|modalite"]')?.value,
    dureeTest: tr.querySelector('input[data-f$="|dureeTest"]')?.value ?? null,
    placeholder: tr.querySelector('input[data-f$="|dureeTest"]')?.placeholder ?? null,
  })));

const aipr = lignes.find((l) => l.code === 'AIPR');
const avec = lignes.find((l) => l.code === 'AIPR-FORM');
const r489 = lignes.find((l) => l.code === 'R489-1A');

check('les deux modalités AIPR sont au catalogue', !!aipr && !!avec,
  lignes.map((l) => l.code).join(', '));
check('l’épreuve seule est reconnue comme telle', aipr?.modalite === 'epreuve', aipr?.modalite);
check('« formation + épreuve » est reconnue comme telle',
  avec?.modalite === 'formation-epreuve', avec?.modalite);
check('l’épreuve du QCM porte ses 2h00', avec?.dureeTest === '2', avec?.dureeTest);
check('une formation ordinaire n’a rien à déclarer', r489?.dureeTest === '', `« ${r489?.dureeTest} »`);
check('…et annonce la durée générale en filigrane', r489?.placeholder === '1', r489?.placeholder);
check('l’épreuve seule n’a pas de créneau de test à régler', aipr?.dureeTest === null,
  String(aipr?.dureeTest));

const options = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.querySelector('td b')?.textContent.trim() === 'R489-1A');
  return [...tr.querySelectorAll('select[data-f$="|modalite"] option')].map((o) => o.value);
});
check('les trois modalités sont offertes',
  options.join(',') === 'formation,epreuve,formation-epreuve', options.join(','));

// --- Saisir une durée de test --------------------------------------------

const cell = (code, champ) => p.locator(`#main table.data tbody tr`).filter({ hasText: code })
  .locator(`[data-f$="|${champ}"]`).first();

// R489 Cat 1A à 1h30 : la durée du catalogue doit l'emporter sur le global.
await cell('R489-1A', 'dureeTest').fill('1.5');
await cell('R489-1A', 'dureeTest').dispatchEvent('change');
await p.waitForTimeout(700);
const enregistre = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'R489-1A').dureeTest);
check('la durée saisie part dans l’état, en minutes', enregistre === 90, String(enregistre));

// Vidé : on retombe sur la durée générale — et l'état porte null, pas 0.
await cell('R489-1A', 'dureeTest').fill('');
await cell('R489-1A', 'dureeTest').dispatchEvent('change');
await p.waitForTimeout(700);
const vide = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'R489-1A').dureeTest);
check('vidée, la durée redevient null (et non 0)', vide === null, String(vide));

// --- Changer de modalité --------------------------------------------------

await cell('HAB-ELEC', 'modalite').selectOption('formation-epreuve');
await p.waitForTimeout(900);
const hab = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'HAB-ELEC'));
check('passer en « formation + épreuve » allume le test et la surveillance',
  hab.tests === true && hab.testSurveille === true && hab.testOnly === false,
  JSON.stringify({ tests: hab.tests, testSurveille: hab.testSurveille, testOnly: hab.testOnly }));

// La colonne « Tests obligatoires » ne se décoche plus : l'épreuve EST le test.
const celluleTests = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.querySelector('td b')?.textContent.trim() === 'HAB-ELEC');
  const tds = [...tr.querySelectorAll('td')];
  return tds[6]?.textContent.trim();
});
check('…et le test n’est plus décochable', celluleTests === 'épreuve', `« ${celluleTests} »`);

await cell('HAB-ELEC', 'modalite').selectOption('formation');
await p.waitForTimeout(900);
const revenu = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'HAB-ELEC'));
check('revenir en « Formation » éteint la surveillance', revenu.testSurveille === false,
  String(revenu.testSurveille));

// --- Créer une formation dans la nouvelle modalité ------------------------

await p.locator('#nf-code').fill('R482-A');
await p.locator('#nf-label').fill('Pratique R482 Cat A');
await p.locator('#nf-reco').fill('R482');
await p.locator('#nf-dtest').fill('1.5');
await p.locator('#btn-add-formation').click();
await p.waitForTimeout(900);
const cree = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).formations.find((f) => f.code === 'R482-A'));
check('une formation créée porte sa durée de test', cree?.dureeTest === 90,
  JSON.stringify(cree?.dureeTest));
check('…et reste une formation ordinaire par défaut',
  cree?.testSurveille === false && cree?.testOnly === false, JSON.stringify(cree));

// --- Ce que la grille en dit ---------------------------------------------

await p.evaluate(async () => {
  const { dateDuJour, addDays, dayOfWeek } = await import('/js/dates.js');
  const ouvre = (iso) => { let d = iso; while (dayOfWeek(d) > 5) d = addDays(d, 1); return d; };
  const jour = ouvre(dateDuJour());
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.openDays = [jour];
  st.dayPresence = {};
  st.inscriptions = [{
    id: 1, stagiaire: 'CANDIDAT Un', formation: 'AIPR-FORM', type: 'Initial',
    statut: 'confirmee', modeTheorie: 'distance',
    datePratique: jour, debutPratique: 480,
    dateTestPratique: jour, debutTestPratique: 780,
  }];
  st.nextId = 2;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});

await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(1000);
const anomalies = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.textContent.includes('CANDIDAT Un'));
  return [...(tr?.querySelectorAll('.status-errors li') || [])].map((li) => li.textContent.trim());
});
check('une AIPR « formation + épreuve » complète ne porte aucune anomalie',
  anomalies.length === 0, anomalies.join(' | '));

await p.goto(BASE + '/#/semaine');
await p.waitForTimeout(1000);
const texte = await p.locator('#main').innerText();
check('la grille nomme l’épreuve « Épreuve », pas « Test pratique »',
  /Épreuve/.test(texte) && !/Test pratique/.test(texte),
  texte.split('\n').filter((l) => /preuve|Test/.test(l)).slice(0, 4).join(' / '));

await p.goto(BASE + '/#/parametres');
await p.waitForTimeout(700);
await p.screenshot({ path: artefact('aipr-modalites-parametres.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
