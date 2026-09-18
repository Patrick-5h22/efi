// Fenêtre de disponibilité des intervenants, depuis l'écran Équipe.
//
// Les tests unitaires couvrent le moteur. Ce qu'ils ne voient pas : les deux
// champs existent-ils, ce qu'on y saisit part-il bien dans l'état, une fenêtre
// inversée est-elle refusée, et l'anomalie se lit-elle dans la liste des
// inscriptions ? Deux défauts de cette session sont passés par ce trou — un
// lien de barre latérale et une cellule non cliquable, tous deux invisibles
// aux tests unitaires.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const dialogues = [];
p.on('dialog', (d) => { dialogues.push(d.message()); d.accept(); });
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Une séance sur un jour ouvert, avec un formateur désigné à la main : c'est
// le cas où l'anomalie doit parler.
const repères = await p.evaluate(async () => {
  const { dateDuJour, addDays, dayOfWeek } = await import('/js/dates.js');
  const ouvre = (iso) => { let d = iso; while (dayOfWeek(d) > 5) d = addDays(d, 1); return d; };
  const jour = ouvre(dateDuJour());

  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { 'HAB-ELEC': { F: true, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { 'HAB-ELEC': { F: true, T: true } } },
  ];
  st.openDays = [jour];
  st.dayPresence = {};
  st.inscriptions = [{
    id: 1, stagiaire: 'CANDIDAT Un', formation: 'HAB-ELEC', type: 'Initial',
    statut: 'confirmee', modeTheorie: 'distance',
    datePratique: jour, debutPratique: 480, formateurId: 'p1',
  }];
  st.nextId = 2;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
  // Fenêtre qui commence bien après ce jour-là.
  return { jour, plusTard: addDays(jour, 30) };
});

await p.goto(BASE + '/#/equipe');
await p.reload();
await p.waitForTimeout(900);

// textContent et non innerText : le CSS met les en-têtes en capitales, et
// innerText rend le texte TEL QU'IL EST PEINT — « DISPONIBLE ».
const entetes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data thead th')].map((t) => t.textContent.trim()));
check('la colonne « Disponible » existe', entetes.includes('Disponible'),
  entetes.slice(0, 3).join(' | '));
const champs = p.locator('#main [data-dispo]');
check('deux champs de date par intervenant', await champs.count() === 4,
  `${await champs.count()} champs pour 2 intervenants`);
check('l’écran explique que la présence garde le dernier mot',
  /présence jour par jour/.test(await p.locator('#main').innerText()));

// Une fenêtre inversée n'exclurait pas « rien » mais TOUT : elle est refusée.
await p.locator('[data-dispo="p1|dispoDebut"]').fill(repères.plusTard);
await p.waitForTimeout(500);
await p.locator('[data-dispo="p1|dispoFin"]').fill(repères.jour);
await p.waitForTimeout(700);
check('une fenêtre inversée est refusée',
  (await p.locator('#toast-zone').innerText()).includes('doit suivre le début'),
  await p.locator('#toast-zone').innerText());
const finApres = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).team.find((m) => m.id === 'p1').dispoFin);
check('…et rien n’est enregistré', finApres === null || finApres === undefined, String(finApres));

// La fenêtre valide, elle, part bien dans l'état.
await p.waitForTimeout(400);
const enregistre = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).team.find((m) => m.id === 'p1').dispoDebut);
check('la borne de début est enregistrée', enregistre === repères.plusTard,
  `${enregistre} attendu ${repères.plusTard}`);

// L'affectation automatique doit avoir basculé sur l'autre intervenant, et la
// ligne à formateur imposé doit porter une anomalie qui DIT pourquoi.
await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(900);
const anomalie = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.textContent.includes('CANDIDAT Un'));
  return {
    erreurs: [...(tr?.querySelectorAll('.status-errors li') || [])].map((li) => li.textContent.trim()),
    badge: document.querySelector('#nav .nav-badge')?.textContent.trim() || null,
  };
});
check('la ligne porte une anomalie de disponibilité',
  anomalie.erreurs.some((e) => /hors de sa période de disponibilité/.test(e)),
  anomalie.erreurs.join(' | ') || 'aucune');
check('…qui donne la fenêtre en clair',
  anomalie.erreurs.some((e) => e.includes(repères.plusTard)),
  anomalie.erreurs.join(' | '));
check('…et pas le message d’absence ponctuelle, qui n’est pas la cause',
  !anomalie.erreurs.some((e) => /non présent ce jour/.test(e)),
  anomalie.erreurs.join(' | '));
check('le compteur d’anomalies s’allume', anomalie.badge !== null, anomalie.badge);

// Vider la borne rend l'intervenant disponible sans limite : l'anomalie part.
await p.goto(BASE + '/#/equipe');
await p.waitForTimeout(700);
await p.locator('[data-dispo="p1|dispoDebut"]').fill('');
await p.waitForTimeout(800);
await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(800);
const apresVidage = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.textContent.includes('CANDIDAT Un'));
  return [...(tr?.querySelectorAll('.status-errors li') || [])].map((li) => li.textContent.trim());
});
check('borne vidée : plus d’anomalie de disponibilité',
  !apresVidage.some((e) => /disponibilité/.test(e)), apresVidage.join(' | ') || 'aucune');

await p.goto(BASE + '/#/equipe');
await p.waitForTimeout(600);
await p.screenshot({ path: artefact('disponibilite-equipe.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
