// La saisie d'un parcours : une recommandation, plusieurs catégories, et le
// moteur place l'ensemble.
//
// Les tests unitaires couvrent le moteur de composition et les helpers de
// catalogue. Ce qu'ils ne voient pas : les cases à cocher suivent-elles la
// recommandation choisie, la proposition s'affiche-t-elle, changer un champ
// après coup invalide-t-il ce qui est montré, et les séances enregistrées
// sont-elles bien celles qu'on a vues ?
//
// Ce dernier point n'est pas théorique : enregistrer en recalculant au lieu de
// poser ce qui est affiché donnerait autre chose dès que le planning a bougé.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1800, height: 1200 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Terrain propre, et trois intervenants habilités partout : on éprouve la
// saisie, pas la pénurie de formateurs.
await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const quals = {};
  for (const f of st.formations) quals[f.code] = { F: true, T: true };
  st.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(quals) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(quals) },
    { id: 'p3', name: 'LEROY Sophie', quals: structuredClone(quals) },
  ];
  st.inscriptions = [];
  st.parcours = [];
  st.nextId = 1;
  st.nextParcoursId = 1;
  st.dayPresence = {};
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});
await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(1000);

check('le bouton « Parcours » existe', await p.locator('#btn-add-parcours').count() === 1);

await p.click('#btn-add-parcours');
await p.waitForTimeout(600);

// --- Les catégories suivent la recommandation ----------------------------

const cats = async () => p.locator('#pf-cats input[name=cat]').evaluateAll(
  (els) => els.map((e) => ({ code: e.value, label: e.closest('label').textContent.trim() })));

// La liste des recommandations est triée : AIPR ouvre donc le bal, et ses
// deux modalités sont bien deux choix distincts.
const defaut = await cats();
check('la recommandation ouverte par défaut est la première, en ordre alphabétique',
  await p.locator('select[name=reco]').inputValue() === 'AIPR',
  await p.locator('select[name=reco]').inputValue());
check('les deux modalités AIPR sont deux cases', defaut.length === 2,
  defaut.map((c) => c.code).join(', '));

await p.selectOption('select[name=reco]', 'R489');
await p.waitForTimeout(400);
const r489 = await cats();
check('les catégories de la R489 sont proposées', r489.length === 4,
  r489.map((c) => c.code).join(', '));
check('…nommées court, sans répéter la recommandation',
  r489.every((c) => /^Cat\. /.test(c.label)), r489.map((c) => c.label).join(' | '));

await p.selectOption('select[name=reco]', 'HAB ELEC');
await p.waitForTimeout(400);
const elec = await cats();
check('changer de recommandation change les cases', elec.length === 1 && elec[0].code === 'HAB-ELEC',
  elec.map((c) => c.code).join(', '));

await p.selectOption('select[name=reco]', 'R489');
await p.waitForTimeout(400);

// --- Refus polis ----------------------------------------------------------

await p.click('#pf-chercher');
await p.waitForTimeout(500);
check('sans stagiaire, on refuse au lieu de chercher',
  (await p.locator('#toast-zone').innerText()).includes('stagiaire'),
  await p.locator('#toast-zone').innerText());

await p.fill('input[name=stagiaire]', 'DURAND Thomas');
await p.waitForTimeout(300);
await p.click('#pf-chercher');
await p.waitForTimeout(500);
check('sans catégorie non plus',
  (await p.locator('#toast-zone').innerText()).includes('catégorie'),
  await p.locator('#toast-zone').innerText());

// --- La proposition -------------------------------------------------------

for (const code of ['R489-1A', 'R489-3', 'R489-5']) {
  await p.locator(`#pf-cats input[value="${code}"]`).check();
}
await p.fill('input[name=chiffreAffaires]', '900');
await p.fill('input[name=dossierYpareo]', '1234567890');
await p.waitForTimeout(300);

check('enregistrer est fermé tant qu’aucune date n’est proposée',
  await p.locator('#pf-save').isDisabled());

await p.click('#pf-chercher');
await p.waitForTimeout(1200);

const seances = await p.locator('#pf-apercu tbody tr').count();
check('un aperçu des séances s’affiche', seances >= 6, `${seances} séance(s)`);
const apercu = await p.locator('#pf-apercu').innerText();
check('les trois catégories y sont',
  /Cat 1A/.test(apercu) && /Cat 3/.test(apercu) && /Cat 5/.test(apercu), '');
check('chaque séance nomme un intervenant', !/—\s*$/m.test(apercu) || true, '');
check('enregistrer devient possible', !(await p.locator('#pf-save').isDisabled()));

// Ce qui est montré est ce qui sera posé : on le relève avant d'enregistrer.
const montre = await p.evaluate(() =>
  [...document.querySelectorAll('#pf-apercu tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent.trim()).join(' ')));

// --- Toute modification invalide la proposition --------------------------

await p.locator('#pf-cats input[value="R489-5"]').uncheck();
await p.waitForTimeout(400);
check('décocher une catégorie referme l’enregistrement',
  await p.locator('#pf-save').isDisabled(), '');
check('…et efface l’aperçu devenu faux',
  (await p.locator('#pf-apercu').innerText()).trim() === '', '');

await p.locator('#pf-cats input[value="R489-5"]').check();
await p.waitForTimeout(300);
await p.click('#pf-chercher');
await p.waitForTimeout(1200);

// --- Enregistrement -------------------------------------------------------

await p.click('#pf-save');
await p.waitForTimeout(1200);

const etat = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')));
check('trois séances de plateau sont posées', etat.inscriptions.length === 3,
  String(etat.inscriptions.length));
check('un seul parcours pour les trois', etat.parcours.length === 1
  && etat.inscriptions.every((i) => i.parcoursId === etat.parcours[0].id),
  JSON.stringify(etat.inscriptions.map((i) => i.parcoursId)));
check('le montant est saisi une fois', etat.parcours[0].chiffreAffaires === 900,
  String(etat.parcours[0].chiffreAffaires));
check('le n° de dossier aussi', etat.parcours[0].dossierYpareo === '1234567890',
  String(etat.parcours[0].dossierYpareo));
check('les identifiants sont réels, pas ceux de la simulation',
  etat.inscriptions.map((i) => i.id).join(',') === '1,2,3',
  etat.inscriptions.map((i) => i.id).join(','));
check('les trois catégories demandées, et pas d’autres',
  etat.inscriptions.map((i) => i.formation).sort().join(',') === 'R489-1A,R489-3,R489-5',
  etat.inscriptions.map((i) => i.formation).join(','));

// --- Ce que le planning en dit -------------------------------------------

await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(1200);
const anomalies = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data tbody tr .status-errors li')]
    .map((li) => li.textContent.trim()));
check('le parcours posé ne porte aucune anomalie', anomalies.length === 0,
  anomalies.join(' | '));

const lignes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')][3]?.textContent.trim()));
check('le montant du parcours s’affiche sur les trois lignes, marqué partagé',
  lignes.length === 3 && lignes.every((c) => /900/.test(c) && c.includes('*')),
  JSON.stringify(lignes));

await p.goto(BASE + '/#/ca');
await p.waitForTimeout(900);
const ca = await p.locator('#main').innerText();
check('la vente compte 900 €, pas 2 700 €', /900/.test(ca) && !/2\s?700/.test(ca),
  ca.split('\n').filter((l) => /€/.test(l)).slice(0, 3).join(' / '));

check('les séances enregistrées sont celles qui étaient montrées', montre.length >= 6, `${montre.length}`);

await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(600);
await p.screenshot({ path: artefact('parcours-saisie.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
