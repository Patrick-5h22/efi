// Le parcours vu du formulaire : rattacher une seconde catégorie à une vente
// existante, plutôt que d'ouvrir une seconde vente.
//
// Les tests unitaires couvrent le modèle et l'agrégation. Ce qu'ils ne voient
// pas : la liste « Parcours » propose-t-elle les ventes du stagiaire saisi et
// d'elles seules, le montant suit-il le parcours choisi, et la liste des
// inscriptions dit-elle que le montant est partagé ? Sans cette dernière
// marque, on lirait deux fois 900 € et on croirait à 1 800 € de CA.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Terrain propre : pas d'exemples, deux jours ouverts partout.
await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.inscriptions = [];
  st.parcours = [];
  st.nextId = 1;
  st.nextParcoursId = 1;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});
await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(900);

// --- Première catégorie : un parcours neuf, avec son montant --------------

const poser = async (formation, { parcours = null, montant = null, dossier = null } = {}) => {
  await p.click('#btn-add');
  await p.waitForTimeout(500);
  await p.fill('input[name=stagiaire]', 'DURAND Thomas');
  await p.waitForTimeout(600); // la liste des parcours suit le nom saisi
  if (parcours !== null) {
    await p.selectOption('select[name=parcoursId]', String(parcours));
    await p.waitForTimeout(500);
  }
  await p.selectOption('select[name=formation]', formation);
  await p.waitForTimeout(500);
  if (dossier !== null) await p.fill('input[name=dossierYpareo]', dossier);
  if (montant !== null) await p.fill('input[name=chiffreAffaires]', montant);
  const jour = await p.locator('select[name=datePratique] option')
    .evaluateAll((o) => o.map((x) => x.value).filter(Boolean)[0]);
  await p.selectOption('select[name=datePratique]', jour);
  await p.waitForTimeout(500);
  const creneau = await p.locator('select[name=debutPratique] option')
    .evaluateAll((o) => o.map((x) => x.value).filter(Boolean)[0]);
  await p.selectOption('select[name=debutPratique]', creneau);
  await p.waitForTimeout(400);
  await p.click('#btn-save');
  await p.waitForTimeout(700);
};

await poser('R489-1A', { montant: '900', dossier: '1234567890' });

let etat = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')));
check('un parcours est né avec la première catégorie', etat.parcours.length === 1,
  JSON.stringify(etat.parcours));
check('il porte le montant', etat.parcours[0].chiffreAffaires === 900,
  String(etat.parcours[0].chiffreAffaires));
check('et le n° de dossier', etat.parcours[0].dossierYpareo === '1234567890',
  String(etat.parcours[0].dossierYpareo));

// --- Seconde catégorie : la liste propose la vente déjà ouverte -----------

await p.click('#btn-add');
await p.waitForTimeout(500);
const avantNom = await p.locator('select[name=parcoursId] option').allInnerTexts();
check('sans stagiaire saisi, aucun parcours n’est proposé', avantNom.length === 1,
  avantNom.join(' | '));

await p.fill('input[name=stagiaire]', 'AUTRE Candidat');
await p.waitForTimeout(700);
const autre = await p.locator('select[name=parcoursId] option').allInnerTexts();
check('un autre stagiaire ne voit pas la vente de Thomas', autre.length === 1,
  autre.join(' | '));

await p.fill('input[name=stagiaire]', 'DURAND Thomas');
await p.waitForTimeout(700);
const options = await p.locator('select[name=parcoursId] option').allInnerTexts();
check('le parcours de Thomas est proposé', options.length === 2, options.join(' | '));
check('…nommé par ses catégories et son montant',
  /Cat 1A/.test(options[1]) && /900/.test(options[1]), options[1]);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

await poser('R489-3', { parcours: 1 });

etat = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')));
check('toujours un seul parcours', etat.parcours.length === 1,
  JSON.stringify(etat.parcours.map((x) => x.id)));
check('les deux séances y sont rattachées',
  etat.inscriptions.length === 2 && etat.inscriptions.every((i) => i.parcoursId === 1),
  JSON.stringify(etat.inscriptions.map((i) => i.parcoursId)));
check('le montant n’a pas été dupliqué', etat.parcours[0].chiffreAffaires === 900,
  String(etat.parcours[0].chiffreAffaires));

// --- Ce que la liste en dit ----------------------------------------------

await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(900);
const cellules = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data tbody tr')].map((tr) => {
    const tds = [...tr.querySelectorAll('td')];
    return { dossier: tds[2]?.textContent.trim(), ca: tds[3]?.textContent.trim() };
  }));
check('les deux lignes affichent le montant du parcours',
  cellules.length === 2 && cellules.every((c) => /900/.test(c.ca)),
  JSON.stringify(cellules.map((c) => c.ca)));
check('…marqué d’une astérisque, parce qu’il est partagé',
  cellules.every((c) => c.ca.includes('*')), JSON.stringify(cellules.map((c) => c.ca)));
check('le n° de parcours est rappelé sous le dossier',
  cellules.every((c) => /parcours n°1/.test(c.dossier)), JSON.stringify(cellules.map((c) => c.dossier)));

// --- Le chiffre d'affaires ------------------------------------------------

await p.goto(BASE + '/#/ca');
await p.waitForTimeout(800);
const ca = await p.locator('#main').innerText();
check('la vente compte une fois, pas deux', /900/.test(ca) && !/1\s?800/.test(ca),
  ca.split('\n').filter((l) => /€/.test(l)).slice(0, 3).join(' / '));

// --- Retirer une séance ne doit pas effacer la vente ----------------------

await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(700);
await p.locator('#main table.data tbody tr').first().locator('[data-del]').first().click();
await p.waitForTimeout(800);
etat = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')));
check('une séance retirée : le parcours tient encore',
  etat.parcours.length === 1 && etat.inscriptions.length === 1,
  `${etat.parcours.length} parcours / ${etat.inscriptions.length} séance(s)`);

await p.locator('#main table.data tbody tr').first().locator('[data-del]').first().click();
await p.waitForTimeout(800);
etat = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')));
check('la dernière séance retirée emporte le parcours',
  etat.parcours.length === 0 && etat.inscriptions.length === 0,
  `${etat.parcours.length} parcours / ${etat.inscriptions.length} séance(s)`);

await p.screenshot({ path: artefact('parcours-inscriptions.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
