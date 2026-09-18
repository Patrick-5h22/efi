// Sites, zones d'évolution et matériels partagés, vus depuis Paramètres.
//
// Les tests unitaires couvrent le paramétrage. Ce qu'ils ne voient pas : les
// trois tableaux sont-ils affichés, les dispositifs admis sont-ils dits en
// CLAIR (et non en codes), la référence en attente porte-t-elle sa mention
// « sans effet », et ce qu'on saisit part-il dans l'état ?

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
await p.goto(BASE + '/#/parametres');
await p.reload();
await p.waitForTimeout(1000);

const texte = await p.locator('#main').innerText();
check('la section existe', /Sites, zones d’évolution|Sites, zones d'évolution/.test(texte),
  texte.split('\n').slice(0, 3).join(' / '));
for (const site of ['Périgny', 'Périgny II', 'Saintes']) {
  check(`le site ${site} est listé`, texte.includes(site));
}

// Les dispositifs admis se lisent en clair : un commercial ne connaît pas les
// codes du catalogue.
check('les dispositifs admis sont dits en clair',
  texte.includes('Pratique R489 Cat 1A') && texte.includes('Pratique R485 Cat 1'),
  texte.split('\n').find((l) => l.includes('mutualisée')) || '—');
check('une recommandation entière se dit comme telle', /toute la R482/.test(texte),
  texte.split('\n').find((l) => l.includes('R482')) || '—');

// La R482 n'est pas au catalogue : les zones et le porte-engin qui la visent
// doivent le DIRE, plutôt que de paraître actifs.
const sansEffet = await p.evaluate(() =>
  [...document.querySelectorAll('#main .badge-warn')].map((b) => b.textContent.trim()));
check('les références en attente portent « sans effet »',
  sansEffet.length === 3 && sansEffet.every((t) => t.startsWith('sans effet')),
  `${sansEffet.length} badge(s) : ${sansEffet.join(' | ')}`);
check('…dont le porte-engin, qui ne contraint encore rien',
  sansEffet.some((t) => t.includes('R482-A')), sansEffet.join(' | '));

// Les deux zones Cat 3/5 et la zone mutualisée sont le cœur du modèle.
const zones = await p.evaluate(() =>
  [...document.querySelectorAll('#main [data-z$="|label"]')].map((i) => i.value));
check('les dix zones livrées sont là', zones.length === 10, `${zones.length} zones`);
check('deux plateaux Cat 3/5 distincts',
  zones.filter((z) => z.includes('Cat 3/5')).length === 2, zones.join(' | '));
check('une seule zone mutualisée R485 / R489 1A-1B',
  zones.filter((z) => z.includes('mutualisée')).length === 1, zones.join(' | '));

const ressources = await p.evaluate(() =>
  [...document.querySelectorAll('#main [data-r$="|label"]')].map((i) => i.value));
check('le porte-engin est déclaré comme matériel partagé',
  ressources.length === 1 && ressources[0] === 'Porte-engin', ressources.join(' | '));

// --- Saisie ---------------------------------------------------------------

const champ = (sel) => p.locator(`#main ${sel}`).first();

await champ('[data-z$="|sessions"]').fill('2');
await champ('[data-z$="|sessions"]').dispatchEvent('change');
await p.waitForTimeout(700);
const sessions = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).zones[0].sessions);
check('le nombre de sessions part dans l’état', sessions === 2, String(sessions));

// Zéro session ne veut pas dire « illimité » mais « zone inutilisable » : refusé.
await champ('[data-z$="|sessions"]').fill('0');
await champ('[data-z$="|sessions"]').dispatchEvent('change');
await p.waitForTimeout(700);
const apres = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).zones[0].sessions);
check('zéro session est refusé', apres === 2, String(apres));
check('…et l’écran le dit', (await p.locator('#toast-zone').innerText()).includes('au moins une session'),
  await p.locator('#toast-zone').innerText());

await champ('[data-z$="|label"]').fill('Plateau mutualisé');
await champ('[data-z$="|label"]').dispatchEvent('change');
await p.waitForTimeout(700);
const renomme = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).zones[0].label);
check('renommer une zone part dans l’état', renomme === 'Plateau mutualisé', renomme);

await champ('[data-r$="|capacite"]').fill('0');
await champ('[data-r$="|capacite"]').dispatchEvent('change');
await p.waitForTimeout(700);
check('zéro exemplaire est refusé aussi',
  (await p.locator('#toast-zone').innerText()).includes('au moins un exemplaire'),
  await p.locator('#toast-zone').innerText());

// Le paramétrage survit à un rechargement : il n'est pas que dans l'écran.
await p.reload();
await p.waitForTimeout(1000);
const apresRechargement = await p.evaluate(() =>
  document.querySelector('#main [data-z$="|label"]')?.value);
check('le paramétrage survit au rechargement', apresRechargement === 'Plateau mutualisé',
  String(apresRechargement));

await p.screenshot({ path: artefact('sites-zones-parametres.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
