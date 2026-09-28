// Les zones d'évolution vues à l'écran : la colonne de la liste, les listes
// déroulantes du formulaire, et l'anomalie quand il n'y a plus de plateau.
//
// Les tests unitaires couvrent le moteur. Ce qu'ils ne voient pas : la zone
// retenue est-elle affichée, le formulaire ne propose-t-il que les plateaux
// qui accueillent le dispositif, un plateau imposé part-il bien dans l'état ?

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

const jour = await p.evaluate(async () => {
  const { dateDuJour, addDays, dayOfWeek } = await import('/js/dates.js');
  const ouvre = (iso) => { let d = iso; while (dayOfWeek(d) > 5) d = addDays(d, 1); return d; };
  const j = ouvre(dateDuJour());

  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const quals = {};
  for (const f of st.formations) quals[f.code] = { F: true, T: true };
  st.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(quals) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(quals) },
    { id: 'p3', name: 'LEROY Sophie', quals: structuredClone(quals) },
  ];
  st.openDays = [j];
  st.dayPresence = {};
  const ligne = (id, stagiaire, formateurId) => ({
    id, stagiaire, formation: 'R489-3', type: 'Initial', statut: 'confirmee',
    modeTheorie: 'distance', datePratique: j, debutPratique: 480, dateTheorie: j,
    formateurId, dateTestPratique: null, debutTestPratique: null,
    zoneId: null, zoneTestId: null,
  });
  st.inscriptions = [ligne(1, 'PREMIER Un', 'p1'), ligne(2, 'DEUXIEME Deux', 'p2'), ligne(3, 'TROISIEME Trois', 'p3')];
  st.nextId = 4;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
  return j;
});

await p.goto(BASE + '/#/inscriptions');
await p.reload();
await p.waitForTimeout(1000);

// --- La colonne Zone ------------------------------------------------------

const entetes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data thead th')].map((t) => t.textContent.trim()));
check('la colonne « Zone » existe', entetes.includes('Zone'), entetes.join(' | '));

const lignes = await p.evaluate(() =>
  [...document.querySelectorAll('#main table.data tbody tr')].map((tr) => {
    const tds = [...tr.querySelectorAll('td')];
    return {
      stagiaire: tds[1]?.textContent.trim().split('\n')[0],
      zone: tds[12]?.textContent.trim(),
      erreurs: [...tr.querySelectorAll('.status-errors li')].map((li) => li.textContent.trim()),
    };
  }));

const un = lignes.find((l) => l.stagiaire?.includes('PREMIER'));
const deux = lignes.find((l) => l.stagiaire?.includes('DEUXIEME'));
const trois = lignes.find((l) => l.stagiaire?.includes('TROISIEME'));

check('le plateau retenu est affiché', /Cat 3\/5/.test(un?.zone || ''), un?.zone);
check('deux séances simultanées occupent deux plateaux distincts',
  un?.zone && deux?.zone && un.zone !== deux.zone, `${un?.zone} / ${deux?.zone}`);
check('la troisième n’a plus de plateau', trois?.zone === '—', trois?.zone);
check('…et le dit en anomalie',
  trois?.erreurs.some((e) => /toutes les zones/.test(e)), trois?.erreurs.join(' | ') || 'aucune');
check('…en nommant les plateaux qui étaient pris',
  trois?.erreurs.some((e) => /Cat 3\/5 #1/.test(e) && /Cat 3\/5 #2/.test(e)),
  trois?.erreurs.join(' | '));
check('les deux premières, elles, n’ont aucune anomalie de plateau',
  ![...(un?.erreurs || []), ...(deux?.erreurs || [])].some((e) => /zone/i.test(e)),
  [...(un?.erreurs || []), ...(deux?.erreurs || [])].join(' | ') || 'aucune');

// --- Le formulaire --------------------------------------------------------

await p.locator('#main table.data tbody tr').filter({ hasText: 'PREMIER Un' })
  .locator('[data-edit]').first().click();
await p.waitForTimeout(900);

const zoneOptions = await p.evaluate(() =>
  [...document.querySelectorAll('select[name="zoneId"] option')].map((o) => o.textContent.trim()));
check('le formulaire propose les plateaux du dispositif', zoneOptions.length === 3,
  zoneOptions.join(' | '));
check('…et seulement ceux-là', zoneOptions.every((t) => t === '— auto —' || /Cat 3\/5/.test(t)),
  zoneOptions.join(' | '));
check('…en nommant le site', zoneOptions.some((t) => t.startsWith('Périgny —')), zoneOptions.join(' | '));
check('le choix par défaut reste l’affectation automatique',
  await p.locator('select[name="zoneId"]').inputValue() === '',
  await p.locator('select[name="zoneId"]').inputValue());
check('l’écran dit combien de plateaux accueillent la formation',
  /2 plateau\(x\)/.test(await p.locator('#zone-info').textContent()),
  await p.locator('#zone-info').textContent());

// Imposer le second plateau : la ligne doit le porter, marqué comme manuel.
await p.locator('select[name="zoneId"]').selectOption('z-35-2');
await p.locator('#btn-save').click();
await p.waitForTimeout(900);

const enregistre = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).inscriptions.find((i) => i.id === 1).zoneId);
check('le plateau imposé part dans l’état', enregistre === 'z-35-2', String(enregistre));

const apres = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#main table.data tbody tr')]
    .find((r) => r.textContent.includes('PREMIER Un'));
  return [...tr.querySelectorAll('td')][12]?.textContent.trim();
});
check('la liste affiche le plateau imposé, marqué à la main',
  /#2/.test(apres || '') && /✎/.test(apres || ''), apres);

// --- La grille le dit aussi ----------------------------------------------

await p.goto(BASE + '/#/semaine');
await p.waitForTimeout(1000);
const infobulle = await p.evaluate(() => {
  const cell = [...document.querySelectorAll('#main td[title]')]
    .find((td) => td.title.includes('PREMIER Un'));
  return cell?.title || '';
});
check('l’infobulle de la grille nomme le site et le plateau',
  /Périgny/.test(infobulle) && /Cat 3\/5/.test(infobulle), infobulle || '(aucune)');

await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(700);
await p.screenshot({ path: artefact('zones-inscriptions.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));
check('le jour de test était bien ouvrable', !!jour, jour);

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
