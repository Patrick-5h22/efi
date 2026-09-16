// Le tableau de bord s'ouvre sur le présent.
//
// Régression : « Prochaines activités » prenait les premières lignes de la
// portée triées par date, sans plancher. Sur la portée « période » — celle par
// défaut — elle affichait donc les activités les plus ANCIENNES : le titre
// promettait l'avenir, le contenu montrait septembre en décembre, et rien ne
// changeait d'un jour à l'autre. Les grilles de semaine, elles, s'ouvraient
// sur « la première semaine qui porte une inscription », soit la plus vieille.
//
// Les dates sont calculées à partir d'aujourd'hui : datées en dur, ces
// scénarios basculeraient dans le passé et le test mentirait dès le lendemain.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Deux journées ouvertes : une passée, une à venir, chacune avec sa séance.
const repères = await p.evaluate(async () => {
  const { dateDuJour, addDays, isoWeek, mondayOf } = await import('/js/dates.js');
  const auj = dateDuJour();
  // Des jours ouvrés sûrs : on recule / avance jusqu'à tomber en semaine.
  const ouvre = (iso, sens) => {
    let d = iso;
    for (let i = 0; i < 7; i += 1) {
      const j = new Date(d + 'T00:00:00Z').getUTCDay();
      if (j >= 1 && j <= 5) return d;
      d = addDays(d, sens);
    }
    return d;
  };
  // Assez proche pour rester DANS la période : une séance hors période serait
  // écartée pour une autre raison, et le test ne prouverait rien.
  const passe = ouvre(addDays(auj, -7), -1);
  const futur = ouvre(addDays(auj, 14), 1);

  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.team = [{ id: 'p1', name: 'MEDAN Dominique', quals: { 'HAB-ELEC': { F: true, T: true } } }];
  st.openDays = [passe, futur];
  st.dayPresence = { [passe]: ['p1'], [futur]: ['p1'] };
  st.inscriptions = [
    {
      id: 1, stagiaire: 'PASSE Ancien', formation: 'HAB-ELEC', type: 'Initial', statut: 'confirmee',
      datePratique: passe, debutPratique: 480, formateurId: 'p1',
    },
    {
      id: 2, stagiaire: 'FUTUR Prochain', formation: 'HAB-ELEC', type: 'Initial', statut: 'confirmee',
      datePratique: futur, debutPratique: 480, formateurId: 'p1',
    },
  ];
  st.nextId = 3;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
  return { auj, passe, futur, semaineAuj: isoWeek(mondayOf(auj)), semainePasse: isoWeek(passe) };
});

await p.goto(BASE + '/#/');
await p.reload();
await p.waitForTimeout(900);

const bord = await p.evaluate(() => {
  const carte = [...document.querySelectorAll('#main .card')]
    .find((c) => c.querySelector('h2')?.textContent.includes('Prochaines activités'));
  return {
    titre: carte?.querySelector('h2')?.textContent.trim(),
    texte: carte?.textContent.replace(/\s+/g, ' ').trim() || '',
    jourMarque: !!document.querySelector('#main .hm-cell.hm-today'),
    semaineMarquee: document.querySelector('#main .hm-week-courante')?.textContent.trim() || null,
  };
});

check('la carte « Prochaines activités » est là', !!bord.titre, bord.titre);
check('elle ne montre PAS la séance passée', !bord.texte.includes('PASSE Ancien'),
  bord.texte.slice(0, 160));
check('elle montre la séance à venir', bord.texte.includes('FUTUR Prochain'));
check('le jour même est repéré sur la carte d’occupation', bord.jourMarque);
check('la semaine en cours est mise en avant', bord.semaineMarquee === String(repères.semaineAuj),
  `${bord.semaineMarquee} vs S${repères.semaineAuj} attendue`);

// Les grilles s'ouvrent sur la semaine en cours, pas sur celle de la plus
// vieille inscription.
await p.goto(BASE + '/#/semaine');
await p.waitForTimeout(800);
const titreSemaine = await p.evaluate(() => document.querySelector('#main h1')?.textContent.trim());
check('les grilles s’ouvrent sur la semaine en cours',
  titreSemaine === `Semaine ${repères.semaineAuj}`,
  `${titreSemaine} — attendu « Semaine ${repères.semaineAuj} » (la plus ancienne inscription est en S${repères.semainePasse})`);

await p.goto(BASE + '/#/synthese');
await p.waitForTimeout(800);
const titreSynthese = await p.evaluate(() => document.querySelector('#main h1')?.textContent.trim());
check('la synthèse aussi', titreSynthese === `Synthèse semaine ${repères.semaineAuj}`,
  `${titreSynthese} — attendu « Synthèse semaine ${repères.semaineAuj} »`);

// Le chemin que prend un humain : le lien de la barre latérale, pas l'URL.
//
// Régression : la vue ouvrait bien la semaine en cours quand on tapait
// « #/semaine », mais le lien « 🗓 Grilles semaine » recopiait un numéro en
// dur — la PREMIÈRE semaine de la période — et ramenait donc au passé à
// chaque clic. Le correctif était invisible à qui n'ouvrait pas l'URL à la
// main : c'est ce lien qu'il faut suivre ici.
await p.goto(BASE + '/#/');
await p.waitForTimeout(600);
const hrefNav = await p.evaluate(() => [...document.querySelectorAll('#nav a')]
  .find((a) => a.textContent.includes('Grilles semaine'))?.getAttribute('href'));
await p.evaluate(() => [...document.querySelectorAll('#nav a')]
  .find((a) => a.textContent.includes('Grilles semaine')).click());
await p.waitForTimeout(800);
const titreClic = await p.evaluate(() => document.querySelector('#main h1')?.textContent.trim());
check('le lien « Grilles semaine » de la barre latérale ouvre la semaine en cours',
  titreClic === `Semaine ${repères.semaineAuj}`,
  `${titreClic} via ${hrefNav} — attendu « Semaine ${repères.semaineAuj} »`);

// Et, une fois sur une semaine choisie, le lien ne ramène pas au présent :
// on reste où l'on est.
await p.goto(BASE + `/#/semaine/${repères.semainePasse}`);
await p.waitForTimeout(700);
const hrefDepuisSemaine = await p.evaluate(() => [...document.querySelectorAll('#nav a')]
  .find((a) => a.textContent.includes('Grilles semaine'))?.getAttribute('href'));
check('depuis une semaine choisie, le lien garde cette semaine',
  hrefDepuisSemaine === `#/semaine/${repères.semainePasse}`, hrefDepuisSemaine);

await p.goto(BASE + '/#/');
await p.waitForTimeout(600);
await p.screenshot({ path: artefact('tableau-de-bord.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
