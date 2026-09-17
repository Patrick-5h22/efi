// Vider les inscriptions depuis Paramètres, sans perdre la configuration.
//
// Demande du centre : repartir d'un planning vide pour une campagne de tests.
// Le seul bouton qui existait — « Réinitialiser toutes les données » — remet
// l'état par défaut et emporte l'équipe, les jours EFI ouverts et la présence
// des intervenants, qui se coche jour par jour. S'en servir pour vider trois
// inscriptions aurait coûté une ressaisie complète.
//
// Ce qui est vérifié ici : les lignes partent, la configuration reste, une
// sauvegarde est réellement téléchargée AVANT, et Ctrl+Z remet tout.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
// Les confirmations sont acceptées ; on garde leur texte, il doit dire ce qui
// est conservé et comment revenir en arrière.
const dialogues = [];
p.on('dialog', (d) => { dialogues.push(d.message()); d.accept(); });

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Une configuration qui coûte cher à ressaisir, et trois inscriptions.
const semé = await p.evaluate(async () => {
  const { dateDuJour, addDays, dayOfWeek } = await import('/js/dates.js');
  const ouvre = (iso) => { let d = iso; while (dayOfWeek(d) > 5) d = addDays(d, 1); return d; };
  const j1 = ouvre(dateDuJour());
  const j2 = ouvre(addDays(j1, 1));

  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  st.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { 'R489-1A': { F: true, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { 'R489-1A': { F: true, T: true } } },
  ];
  st.openDays = [j1, j2];
  st.dayPresence = { [j1]: ['p1'], [j2]: ['p1', 'p2'] };
  st.dayAssignments = { [j1]: { formateur: 'p1', testeur: 'p2' } };
  st.params.maxDailyLoad = 420;
  st.inscriptions = ['UN Premier', 'DEUX Second', 'TROIS Troisieme'].map((stagiaire, k) => ({
    id: k + 1, stagiaire, formation: 'R489-1A', type: 'Initial', statut: 'confirmee',
    modeTheorie: 'distance', datePratique: j1, debutPratique: 480 + k * 120,
    formateurId: 'p1', chiffreAffaires: 1250, dossierYpareo: '0123456789',
  }));
  st.nextId = 4;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
  return { j1, j2 };
});

await p.goto(BASE + '/#/parametres');
await p.reload();
await p.waitForTimeout(900);

const { check, bilan } = compteur();

const bouton = p.locator('#btn-vider-inscriptions');
check('le bouton « Vider les inscriptions » existe', await bouton.count() === 1);
check('il annonce le nombre de lignes', (await bouton.innerText()).includes('(3)'),
  await bouton.innerText());
const notice = await p.locator('#main').innerText();
check('la page dit ce qui est conservé',
  /présence des intervenants/.test(notice) && /jours EFI/.test(notice));
check('…et comment revenir en arrière', /Ctrl/.test(notice) && /sauvegarde/i.test(notice.toLowerCase()));

// Le filet : une sauvegarde doit PARTIR avant la suppression.
const [telechargement] = await Promise.all([
  p.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  bouton.click(),
]);
await p.waitForTimeout(900);

check('la confirmation énumère ce qui survit',
  dialogues.some((m) => /Conservés/.test(m) && /présence des intervenants/.test(m)),
  dialogues.join(' | ').slice(0, 140));
check('une sauvegarde est téléchargée avant la suppression', !!telechargement,
  telechargement ? telechargement.suggestedFilename() : 'aucun téléchargement');
check('son nom marque qu’elle précède le vidage',
  !!telechargement && telechargement.suggestedFilename().includes('avant-vidage'),
  telechargement?.suggestedFilename());

// Le contenu du fichier doit être relisible, sinon le filet ne retient rien.
if (telechargement) {
  const { readFileSync } = await import('node:fs');
  const chemin = await telechargement.path();
  const sauvegarde = JSON.parse(readFileSync(chemin, 'utf8'));
  check('la sauvegarde contient bien les trois inscriptions',
    sauvegarde.inscriptions?.length === 3, String(sauvegarde.inscriptions?.length));
  check('avec leur chiffre d’affaires', sauvegarde.inscriptions?.[0]?.chiffreAffaires === 1250,
    String(sauvegarde.inscriptions?.[0]?.chiffreAffaires));
}

const apres = await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  return {
    inscriptions: st.inscriptions.length,
    nextId: st.nextId,
    equipe: st.team.map((m) => m.name),
    jours: st.openDays,
    presence: st.dayPresence,
    affectations: st.dayAssignments,
    charge: st.params.maxDailyLoad,
    formations: st.formations.length,
  };
});

check('plus aucune inscription', apres.inscriptions === 0, String(apres.inscriptions));
check('l’équipe est intacte', apres.equipe.join(', ') === 'MEDAN Dominique, GARCIA Thierry',
  apres.equipe.join(', '));
check('les jours EFI ouverts sont intacts', apres.jours.join(',') === `${semé.j1},${semé.j2}`,
  apres.jours.join(','));
check('la présence des intervenants est intacte',
  JSON.stringify(apres.presence) === JSON.stringify({ [semé.j1]: ['p1'], [semé.j2]: ['p1', 'p2'] }),
  JSON.stringify(apres.presence));
check('les affectations du jour sont intactes',
  JSON.stringify(apres.affectations) === JSON.stringify({ [semé.j1]: { formateur: 'p1', testeur: 'p2' } }),
  JSON.stringify(apres.affectations));
check('les paramètres sont intacts', apres.charge === 420, String(apres.charge));
check('le catalogue est intact', apres.formations > 0, String(apres.formations));
check('nextId ne recule pas', apres.nextId === 4, String(apres.nextId));

// Les vues suivent : plus de dossiers, plus de lignes, plus d'anomalies.
await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(700);
// La vue ne laisse pas un tableau vide sans explication : elle écrit une
// ligne « Aucune inscription. ». C'est ce qu'on vérifie, pas zéro ligne.
const listeVide = await p.evaluate(() => {
  const lignes = [...document.querySelectorAll('#main table.data tbody tr')];
  return {
    nb: lignes.length,
    texte: lignes.map((tr) => tr.textContent.trim()).join(' | '),
    badge: document.querySelector('#nav .nav-badge')?.textContent.trim() || null,
  };
});
check('la liste des inscriptions annonce qu’elle est vide',
  listeVide.nb === 1 && /^Aucune inscription\.$/.test(listeVide.texte),
  `${listeVide.nb} ligne(s) : ${listeVide.texte}`);
check('le compteur d’anomalies est muet', listeVide.badge === null, listeVide.badge);

await p.goto(BASE + '/#/stagiaires');
await p.waitForTimeout(700);
const dossiers = await p.locator('#main table.data tbody tr').count();
check('plus aucun dossier stagiaire', dossiers === 0, String(dossiers));

// Ctrl+Z : le vidage passe par l'historique comme toute autre mutation.
await p.goto(BASE + '/#/inscriptions');
await p.waitForTimeout(600);
await p.keyboard.press('Control+z');
await p.waitForTimeout(900);
const restaure = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('efi-planning-v1')).inscriptions.length);
check('Ctrl+Z remet les trois inscriptions', restaure === 3, String(restaure));

await p.goto(BASE + '/#/parametres');
await p.waitForTimeout(600);
await p.screenshot({ path: artefact('vidage-parametres.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
