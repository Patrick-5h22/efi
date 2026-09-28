// L'écran Jours EFI, devenu un calendrier par site.
//
// Les tests unitaires couvrent les prédicats et le moteur. Ce qu'ils ne voient
// pas : les onglets existent-ils, le calendrier édite-t-il bien le site
// sélectionné et lui seul, le tableau du dessous dit-il qui ouvre quel jour ?

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1700, height: 1200 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Deux journées ouvertes partout, pour partir d'un état connu.
const jours = await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const tous = [...new Set(Object.values(st.openDays).flat())].sort();
  st.openDays = Object.fromEntries(st.sites.map((s) => [s.id, [...tous]]));
  st.inscriptions = [];
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
  return tous;
});

await p.goto(BASE + '/#/jours');
await p.reload();
await p.waitForTimeout(1000);

// --- Les onglets ----------------------------------------------------------

const onglets = await p.evaluate(() =>
  [...document.querySelectorAll('#main [data-site]')].map((b2) => b2.textContent.trim().replace(/\s+/g, ' ')));
check('un onglet par site', onglets.length === 3, onglets.join(' | '));
check('les trois sites sont nommés',
  onglets.some((t) => t.startsWith('Périgny ')) && onglets.some((t) => t.startsWith('Périgny II'))
  && onglets.some((t) => t.startsWith('Saintes')), onglets.join(' | '));
check('chaque onglet compte ses jours ouverts',
  onglets.every((t) => t.endsWith(String(jours.length))), onglets.join(' | '));

check('l’écran dit quel site le calendrier modifie',
  /Cliquer sur un jour pour ouvrir\/fermer\s*Périgny/.test(
    (await p.locator('#main').innerText()).replace(/\s+/g, ' ')),
  (await p.locator('#main').innerText()).split('\n').find((l) => /Cliquer sur un jour/.test(l)) || '—');

// --- Fermer un jour sur UN seul site --------------------------------------

const premier = jours[0];
await p.locator(`#main [data-toggle="${premier}"]`).click();
await p.waitForTimeout(700);

const apres = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')).openDays);
check('le jour se ferme sur le site sélectionné',
  !apres.perigny.includes(premier), JSON.stringify(apres.perigny));
check('…et reste ouvert sur les deux autres',
  apres.perigny2.includes(premier) && apres.saintes.includes(premier),
  `P2=${apres.perigny2.length} S=${apres.saintes.length}`);

// Le tableau du dessous nomme les sites ouverts, journée par journée.
// Badge par badge, et non sur le texte concaténé : « Périgny II Saintes »
// contient « Périgny », et une expression régulière le dirait ouvert.
const badges = await p.evaluate((j) => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.querySelector('td')?.textContent.includes(j.slice(8, 10)));
  const td = [...(tr?.querySelectorAll('td') || [])][2];
  return [...(td?.querySelectorAll('.badge') || [])].map((x) => x.textContent.trim());
}, premier);
check('le tableau liste les sites encore ouverts ce jour-là',
  badges.length === 2 && badges.includes('Périgny II') && badges.includes('Saintes')
  && !badges.includes('Périgny'),
  badges.join(' | ') || '(cellule introuvable)');

// --- Changer d'onglet -----------------------------------------------------

await p.locator('#main [data-site="saintes"]').click();
await p.waitForTimeout(700);
check('le calendrier suit l’onglet',
  /ouvrir\/fermer\s*Saintes/.test((await p.locator('#main').innerText()).replace(/\s+/g, ' ')),
  (await p.locator('#main').innerText()).split('\n').find((l) => /Cliquer sur un jour/.test(l)) || '—');

const ouvertIci = await p.evaluate((j) => {
  const td = document.querySelector(`#main [data-toggle="${j}"]`);
  return { classe: td?.className, presse: td?.getAttribute('aria-pressed') };
}, premier);
check('la journée fermée ailleurs reste ouverte ici',
  ouvertIci.classe === 'cal-open' && ouvertIci.presse === 'true', JSON.stringify(ouvertIci));

await p.locator(`#main [data-toggle="${premier}"]`).click();
await p.waitForTimeout(700);
const apres2 = await p.evaluate(() => JSON.parse(localStorage.getItem('efi-planning-v1')).openDays);
check('fermer sur Saintes ne rouvre pas Périgny',
  !apres2.saintes.includes(premier) && !apres2.perigny.includes(premier),
  `P=${JSON.stringify(apres2.perigny)} S=${JSON.stringify(apres2.saintes)}`);
check('…et ne touche pas Périgny II',
  apres2.perigny2.includes(premier), JSON.stringify(apres2.perigny2));

// --- Ce que le planning en dit -------------------------------------------

// Une habilitation électrique posée ce jour-là : elle ne se tient qu'à
// Périgny ou Saintes, tous deux fermés — elle doit être signalée.
await p.evaluate((j) => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.inscriptions = [{
    id: 1, stagiaire: 'CANDIDAT Un', formation: 'HAB-ELEC', type: 'Initial',
    statut: 'confirmee', modeTheorie: 'distance',
    datePratique: j, debutPratique: 480, formateurId: 'p1',
    zoneId: null, zoneTestId: null,
  }];
  st.nextId = 2;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
}, premier);

await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(1000);
const anomalies = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.textContent.includes('CANDIDAT Un'));
  return [...(tr?.querySelectorAll('.status-errors li') || [])].map((li) => li.textContent.trim());
});
check('une séance sur un site fermé est signalée',
  anomalies.some((e) => /aucun site ouvert ce jour/.test(e)), anomalies.join(' | ') || 'aucune');
check('…en nommant les sites qui auraient pu l’accueillir',
  anomalies.some((e) => /Périgny/.test(e) && /Saintes/.test(e)), anomalies.join(' | '));

await p.goto(BASE + '/#/jours');
await p.waitForTimeout(700);
await p.screenshot({ path: artefact('jours-par-site.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
