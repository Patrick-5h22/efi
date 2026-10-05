// Alignement des deux grilles hebdomadaires FORMATEUR / TESTEUR.
//
// Régression : chaque demi-heure étant une cellule distincte, une séance d'une
// heure répétait son libellé deux fois et un jour fermé écrivait « FERMÉ »
// dix-huit fois. Les colonnes se dimensionnant sur leur contenu, une
// demi-heure occupée devenait large et une demi-heure vide se rétractait — les
// deux grilles n'avaient plus les mêmes largeurs et 10:00 chez le formateur ne
// tombait pas sous 10:00 chez le testeur. Illisible.
//
// Ce qui est vérifié ici tient en une phrase : mêmes abscisses d'une grille à
// l'autre, colonnes d'égale largeur, et chaque séance écrite une seule fois.

import { lancerNavigateur, BASE, artefact, compteur } from './_harness.mjs';

const b = await lancerNavigateur();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const { check, bilan } = compteur();

await p.goto(BASE + '/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(900);

// Semaine 39 de 2026 : lundi 21/09 → vendredi 25/09. Seuls mercredi et jeudi
// sont ouverts, pour que la fusion des jours fermés soit aussi exercée.
await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('efi-planning-v1'));
  const quals = { 'R489-3': { F: true, T: true }, 'R489-5': { F: true, T: true } };
  st.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(quals) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(quals) },
  ];
  st.openDays = ['2026-09-23', '2026-09-24'];
  st.dayPresence = { '2026-09-23': ['p1', 'p2'], '2026-09-24': ['p1', 'p2'] };
  st.inscriptions = [
    {
      id: 1, stagiaire: 'DURAND Thomas', formation: 'R489-3', type: 'Initial', statut: 'confirmee',
      datePratique: '2026-09-23', debutPratique: 480, formateurId: 'p1',
      dateTheorie: '2026-09-23',
      dateTestPratique: '2026-09-23', debutTestPratique: 780, testeurId: 'p2',
    },
    {
      // Même créneau que DURAND, même catégorie : R489 Cat 3 admet deux
      // stagiaires (capacité 2). La cellule porte donc DEUX inscriptions.
      id: 4, stagiaire: 'PETIT Sophie', formation: 'R489-3', type: 'Initial', statut: 'confirmee',
      datePratique: '2026-09-23', debutPratique: 480, formateurId: 'p1',
      dateTheorie: '2026-09-23',
      dateTestPratique: '2026-09-23', debutTestPratique: 840, testeurId: 'p2',
    },
    {
      // Second formateur le même jour : la cellule doit alors nommer le sien.
      id: 3, stagiaire: 'BERNARD Paul', formation: 'R489-5', type: 'Initial', statut: 'confirmee',
      datePratique: '2026-09-23', debutPratique: 600, formateurId: 'p2',
      dateTheorie: '2026-09-23',
      dateTestPratique: '2026-09-23', debutTestPratique: 900, testeurId: 'p2',
    },
    {
      id: 2, stagiaire: 'MARTIN Léa', formation: 'R489-5', type: 'Recyclage', statut: 'pre',
      datePratique: '2026-09-24', debutPratique: 480, formateurId: 'p1',
      dateTheorie: '2026-09-24',
      dateTestPratique: '2026-09-24', debutTestPratique: 810, testeurId: 'p2',
    },
  ];
  st.nextId = 5;
  localStorage.setItem('efi-planning-v1', JSON.stringify(st));
});

// Rechargement obligatoire : l'application a déjà son état en mémoire, un
// simple changement d'ancre ne le relirait pas — et le réenregistrerait
// par-dessus celui qu'on vient d'écrire.
await p.goto(BASE + '/#/semaine/39');
await p.reload();
await p.waitForTimeout(900);

const mesure = await p.evaluate(() => {
  const tables = [...document.querySelectorAll('#main table.planning')];
  return tables.map((t) => ({
    entetes: [...t.querySelectorAll('tr:first-child th')].map((th) => ({
      texte: th.textContent.trim(),
      x: Math.round(th.getBoundingClientRect().left * 10) / 10,
      l: Math.round(th.getBoundingClientRect().width * 10) / 10,
    })),
    lignes: [...t.querySelectorAll('tr')].slice(1).map((tr) => ({
      jour: tr.querySelector('td.day-col')?.textContent.trim().slice(0, 9),
      intervenant: tr.querySelector('td.who-col')?.textContent.trim(),
      hauteurJour: Math.round(tr.querySelector('td.day-col')?.getBoundingClientRect().height || 0),
      colonnes: [...tr.querySelectorAll('td')].slice(2)
        .reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0),
      cellules: [...tr.querySelectorAll('td')].slice(2).map((td) => ({
        cls: td.className,
        span: Number(td.getAttribute('colspan')) || 1,
        texte: td.textContent.trim(),
        titre: td.getAttribute('title') || '',
        // Points d'entrée : une porte par inscription, jamais sur la cellule
        entrees: [...td.querySelectorAll('.cell-entry[data-insc]')].map((e) => e.dataset.insc),
        celluleCablee: td.hasAttribute('data-insc'),
      })),
    })),
  }));
});

check('les deux grilles sont rendues', mesure.length === 2, `${mesure.length} table(s)`);

const [f, t] = mesure;
const creneaux = f.entetes.slice(2);
check('18 créneaux de 30 min, de 08:00 à 16:30', creneaux.length === 18,
  `${creneaux.length} — de ${creneaux[0]?.texte} à ${creneaux.at(-1)?.texte}`);

// Le cœur du sujet : même heure, même abscisse dans les deux grilles.
const desalignes = f.entetes
  .map((e, i) => ({ e, a: t.entetes[i] }))
  .filter(({ e, a }) => !a || Math.abs(e.x - a.x) > 0.5 || Math.abs(e.l - a.l) > 0.5);
check('chaque heure tombe à la même abscisse dans les deux grilles', desalignes.length === 0,
  desalignes.slice(0, 3).map(({ e, a }) => `${e.texte} : ${e.x}px vs ${a?.x}px`).join(' | '));

// Colonnes d'égale largeur : c'est ce que le contenu répété détruisait.
const largeurs = creneaux.map((c) => c.l);
const ecart = Math.max(...largeurs) - Math.min(...largeurs);
check('toutes les colonnes de créneaux ont la même largeur', ecart <= 1,
  `écart ${ecart}px (min ${Math.min(...largeurs)}, max ${Math.max(...largeurs)})`);

// Chaque ligne couvre la grille entière : une fusion ratée se verrait ici.
const incompletes = [...f.lignes, ...t.lignes].filter((l) => l.colonnes !== creneaux.length);
check('chaque ligne couvre exactement la largeur de la grille', incompletes.length === 0,
  incompletes.slice(0, 3).map((l) => `${l.jour} : ${l.colonnes}`).join(' | '));

// Un jour fermé s'écrit une fois, pas dix-huit.
const lundi = f.lignes.find((l) => l.jour?.startsWith('Lun'));
const fermees = lundi?.cellules.filter((c) => c.cls.includes('slot-closed')) || [];
check('un jour fermé tient en une seule cellule', fermees.length === 1 && fermees[0].span === creneaux.length,
  `${fermees.length} cellule(s), colspan ${fermees[0]?.span}`);

// Une séance écrit son libellé une fois, sur une cellule fusionnée.
const mercredi = f.lignes.find((l) => l.jour?.startsWith('Mer'));
const seances = mercredi?.cellules.filter((c) => c.cls.includes('slot-busy')) || [];
check('chaque séance de pratique est une cellule fusionnée',
  seances.length === 2 && seances.every((c) => c.span > 1),
  `${seances.length} cellule(s), colspan ${seances.map((c) => c.span).join(' et ')}`);
check('le nom du stagiaire n’est écrit qu’une fois sur la ligne',
  (mercredi?.cellules.filter((c) => c.texte.includes('DURAND Thomas')).length || 0) === 1);

// La pré-réservation garde sa couleur et son tiret après fusion.
const jeudi = f.lignes.find((l) => l.jour?.startsWith('Jeu'));
const pre = jeudi?.cellules.find((c) => c.texte.includes('MARTIN Léa'));
check('une pré-réservation fusionnée reste jaune (slot-pre)', !!pre && pre.cls.includes('slot-pre'),
  pre?.cls || 'absente');

// L'intervenant n'est nommé dans une cellule que s'il y apprend quelque chose.
check('jeudi ne compte qu’un intervenant', jeudi?.intervenant?.includes('MEDAN')
  && !jeudi?.intervenant?.includes('GARCIA'), jeudi?.intervenant);
check('il n’est alors pas répété dans la cellule', !!pre && !pre.texte.includes('MEDAN'),
  pre?.texte.replace(/\s+/g, ' '));
check('mais l’infobulle le donne toujours', !!pre && pre.titre.includes('MEDAN Dominique'), pre?.titre);

// Mercredi : deux formateurs, la cellule doit dire lequel.
const deuxFormateurs = mercredi?.intervenant?.includes('MEDAN') && mercredi?.intervenant?.includes('GARCIA');
check('mercredi compte deux intervenants', deuxFormateurs, mercredi?.intervenant);
const nommees = mercredi?.cellules.filter((c) => c.cls.includes('slot-busy')) || [];
check('chaque cellule nomme alors le sien', nommees.length === 2 && nommees.every((c) => c.texte.includes('Form. :')),
  nommees.map((c) => c.texte.replace(/\s+/g, ' ')).join(' / '));

// Le test théorique de la grille testeur couvre son heure d'un seul bloc.
const theorie = t.lignes.flatMap((l) => l.cellules).filter((c) => c.cls.includes('slot-theory'));
check('le test théorique tient en une cellule par jour', theorie.length > 0 && theorie.every((c) => c.span > 1),
  theorie.map((c) => `colspan ${c.span}`).join(', ') || 'aucune');

// Une séance à deux stagiaires doit offrir deux portes, pas zéro.
//
// Régression : seule la cellule était cliquable, et seulement quand elle ne
// portait qu'une inscription — le formulaire n'en éditant qu'une, le code
// préférait ne rien poser plutôt que de choisir à l'aveugle. Une séance à
// deux stagiaires n'était donc pas modifiable depuis la grille.
const cellule2 = mercredi?.cellules.find((c) => c.texte.includes('DURAND Thomas'));
check('une séance à deux stagiaires porte bien les deux',
  !!cellule2 && cellule2.texte.includes('PETIT Sophie'), cellule2?.texte.replace(/\s+/g, ' '));
check('…et offre un point d’entrée par inscription', cellule2?.entrees.length === 2,
  `${cellule2?.entrees.length} entrée(s) : ${cellule2?.entrees.join(', ')}`);
check('la cellule elle-même n’est pas câblée (sinon double ouverture)',
  [...f.lignes, ...t.lignes].every((l) => l.cellules.every((c) => !c.celluleCablee)));

// Et le clic ouvre bien l'inscription de CETTE ligne, pas de l'autre.
const lignes2 = p.locator('#main td.slot-busy .cell-entry[data-insc]')
  .filter({ hasText: 'PETIT Sophie' });
await lignes2.first().click();
await p.waitForTimeout(500);
const saisi = await p.locator('dialog[open] input[name=stagiaire]').inputValue().catch(() => '');
check('cliquer une ligne ouvre l’inscription de ce stagiaire', saisi === 'PETIT Sophie', saisi || 'aucun formulaire');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);

// ---------------------------------------------------------------------------
// Bandes horizontales et hauteur de ligne
//
// « Pas facile à lire » : dix-huit colonnes de trente minutes, et rien pour
// tenir la ligne d'un bout à l'autre. Une ligne sur deux est donc teintée —
// mais seulement ses cellules NEUTRES : rayer une cellule confirmée ou
// pré-réservée rendrait sa couleur, qui porte le sens, ambiguë.
//
// Les hauteurs, ensuite : à hauteur libre, un jour fermé faisait 22 px et un
// jour chargé 46, la grille montait et descendait en escalier.
// ---------------------------------------------------------------------------
const bandes = await p.evaluate(() => {
  const tbl = document.querySelector('#main table.planning');
  const fond = (el) => (el ? getComputedStyle(el).backgroundColor : null);
  return [...tbl.querySelectorAll('tr')].slice(1).map((tr) => ({
    jour: tr.querySelector('.jour-sem')?.textContent.trim(),
    date: tr.querySelector('.jour-date')?.textContent.trim(),
    traitHaut: parseFloat(getComputedStyle(tr.querySelector('td.day-col')).borderTopWidth),
    // textContent et non innerText : les capitales viennent du CSS, et
    // innerText rendrait le texte TEL QU'IL EST PEINT — « MARDI ».
    capitales: getComputedStyle(tr.querySelector('.jour-sem')).textTransform,
    poidsJour: getComputedStyle(tr.querySelector('.jour-sem')).fontWeight,
    poidsDate: getComputedStyle(tr.querySelector('.jour-date')).fontWeight,
    alt: tr.classList.contains('ligne-alt'),
    h: Math.round(tr.getBoundingClientRect().height),
    fondJour: fond(tr.querySelector('td.day-col')),
    fondLibre: fond(tr.querySelector('td.slot-free')),
    // Une cellule d'état ne doit PAS être teintée par la bande : sa couleur
    // doit rester exactement celle de la même cellule sur une ligne paire.
    fondOccupee: fond(tr.querySelector('td.slot-busy:not(.slot-pre)')),
    fondFermee: fond(tr.querySelector('td.slot-closed')),
  }));
});

check('une ligne sur deux porte la bande',
  bandes.filter((l) => l.alt).length === 2 && bandes.filter((l) => !l.alt).length === 3,
  bandes.map((l) => `${l.jour}${l.alt ? '*' : ''}`).join(' '));
check('la bande suit le jour de la semaine (mardi, jeudi)',
  bandes.every((l) => l.alt === ['Mardi', 'Jeudi'].includes(l.jour)),
  bandes.filter((l) => l.alt).map((l) => l.jour).join(', '));

const [alt] = bandes.filter((l) => l.alt);
const [normale] = bandes.filter((l) => !l.alt);

// L'en-tête de jour ne suit plus la bande, et c'est voulu : il est désormais
// un bloc à contre-ton, identique d'une journée à l'autre. L'alternance seule
// ne suffisait pas à voir où un jour commence — le bloc et le trait s'en
// chargent, la bande ne sert plus qu'à suivre la ligne vers la droite.
check('l’en-tête de jour est un bloc uniforme, bande ou non',
  alt.fondJour === normale.fondJour, `${alt.fondJour} vs ${normale.fondJour}`);
check('…et il tranche avec le créneau libre voisin',
  normale.fondJour !== normale.fondLibre, `${normale.fondJour} vs ${normale.fondLibre}`);
check('la date s’écrit en gros', bandes.every((l) => /^\d{2}\/\d{2}$/.test(l.date || '')),
  bandes.map((l) => l.date).join(' '));
// Le jour s'écrit en entier : c'est une demande explicite, et rien ne la
// tenait — repasser à « Mar » n'aurait fait échouer aucune suite.
check('le jour de la semaine la surmonte, écrit en ENTIER',
  bandes.every((l) => ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
    .includes(l.jour || '')),
  bandes.map((l) => l.jour).join(' '));
check('…en capitales', bandes.every((l) => l.capitales === 'uppercase'),
  [...new Set(bandes.map((l) => l.capitales))].join(', '));
check('…et sans gras : c’est une étiquette, la date est le titre',
  bandes.every((l) => Number(l.poidsJour) <= 500 && Number(l.poidsDate) > Number(l.poidsJour)),
  `jour ${bandes[0]?.poidsJour} · date ${bandes[0]?.poidsDate}`);
check('un trait franc referme chaque journée',
  bandes.every((l) => l.traitHaut >= 2), bandes.map((l) => l.traitHaut).join(', '));

// ---------------------------------------------------------------------------
// L'ordre des deux colonnes de gauche, et la largeur de celle du jour.
//
// L'intervenant vient en PREMIER : c'est la colonne de gauche qui reste collée
// au défilement horizontal, et un nom s'y cherche là où une date se retrouve.
// Rien ne le vérifiait — la colonne a pu passer de l'autre côté sans qu'une
// seule suite bronche.
// ---------------------------------------------------------------------------
const colonnes = await p.evaluate(() => {
  const tbl = document.querySelector('#main table.planning');
  const entetes = [...tbl.querySelectorAll('tr th')].slice(0, 2)
    .map((th) => ({ texte: th.textContent.trim(), classe: th.className }));
  const td = tbl.querySelector('td.day-col');
  const date = td.querySelector('.jour-date');
  // Largeur réelle du texte, hors contrainte de la cellule.
  const mesurer = (texte, el) => {
    const son = document.createElement('span');
    const cs = getComputedStyle(el);
    son.textContent = texte;
    son.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
      + `;font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform}`;
    document.body.appendChild(son);
    const w = son.getBoundingClientRect().width;
    son.remove();
    return w;
  };
  const texte = mesurer(date.textContent, date);
  // Le PIRE des sept jours, pas celui qui se trouve affiché : la grille d'une
  // autre semaine ne doit pas découvrir que « dimanche » ne rentre pas.
  const sem = td.querySelector('.jour-sem');
  const pire = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
    .map((j) => ({ j, w: mesurer(j, sem) })).sort((a, z) => z.w - a.w)[0];
  const padTd = getComputedStyle(td);
  const premier = tbl.querySelector('tbody tr td') || tbl.querySelector('tr td');
  return {
    entetes,
    largeurJour: Math.round(td.getBoundingClientRect().width),
    largeurTexte: Math.ceil(texte),
    // Place réellement disponible pour le texte, padding déduit.
    utile: td.getBoundingClientRect().width
      - parseFloat(padTd.paddingLeft) - parseFloat(padTd.paddingRight),
    pireJour: pire.j,
    largeurPireJour: Math.ceil(pire.w),
    replieJour: sem.getClientRects().length > 1,
    collant: getComputedStyle(premier).position,
    classePremier: premier.className,
  };
});

check('la colonne « Intervenant » vient en premier',
  colonnes.entetes[0]?.texte === 'Intervenant', colonnes.entetes.map((e) => e.texte).join(' | '));
check('…et « Jour » juste après',
  colonnes.entetes[1]?.texte === 'Jour', colonnes.entetes.map((e) => e.texte).join(' | '));
check('c’est la PREMIÈRE colonne qui reste collée au défilement',
  colonnes.collant === 'sticky' && colonnes.classePremier.includes('who-col'),
  `${colonnes.collant} sur « ${colonnes.classePremier} »`);
check('la colonne « Jour » est à la taille de sa date, sans excès',
  colonnes.largeurJour >= colonnes.largeurTexte + 8
  && colonnes.largeurJour <= colonnes.largeurTexte + 32,
  `colonne ${colonnes.largeurJour} px pour ${colonnes.largeurTexte} px de texte`);
// La condition posée pour écrire le jour en entier : « pourvu que cela tienne
// en largeur ». Le jour le plus long de la semaine, et non celui qui se trouve
// à l'écran — sans quoi la suite passerait un mardi et casserait un dimanche.
check(`le plus long jour de la semaine y tient d’une seule ligne (${colonnes.pireJour})`,
  colonnes.largeurPireJour <= colonnes.utile && !colonnes.replieJour,
  `${colonnes.pireJour} : ${colonnes.largeurPireJour} px pour ${Math.floor(colonnes.utile)} px utiles`);
const libreAlt = bandes.find((l) => l.alt && l.fondLibre)?.fondLibre;
const libreNormal = bandes.find((l) => !l.alt && l.fondLibre)?.fondLibre;
check('un créneau libre est teinté sur la bande, pas ailleurs',
  !!libreAlt && !!libreNormal && libreAlt !== libreNormal,
  `hors bande ${libreNormal} · sur bande ${libreAlt}`);

// Le point délicat : la bande ne doit pas mordre sur le code couleur.
const occupees = [...new Set(bandes.filter((l) => l.fondOccupee).map((l) => l.fondOccupee))];
check('une cellule confirmée garde sa couleur sur la bande comme ailleurs',
  occupees.length === 1, occupees.join(' vs '));
const fondsFermes = [...new Set(bandes.filter((l) => l.fondFermee).map((l) => l.fondFermee))];
check('un jour fermé garde la sienne', fondsFermes.length === 1, fondsFermes.join(' vs '));

// Hauteurs. Une cellule qui porte DEUX stagiaires écrit un nom de plus : sa
// ligne dépasse donc, mais d'une ligne de texte — pas du double. Avant, la
// formation était réécrite pour chaque stagiaire et mercredi faisait 103 px
// contre 46 aux autres.
const sansPile = bandes.filter((l) => !['Mercredi'].includes(l.jour));
check('toutes les lignes ordinaires ont exactement la même hauteur',
  new Set(sansPile.map((l) => l.h)).size === 1,
  sansPile.map((l) => `${l.jour} ${l.h}px`).join(' | '));
const mer = bandes.find((l) => l.jour === 'Mercredi');
const ordinaire = sansPile[0].h;
check('une cellule à deux stagiaires n’ajoute qu’une ligne de texte',
  mer.h > ordinaire && mer.h < ordinaire * 2,
  `${mer.h}px contre ${ordinaire}px — écart ${mer.h - ordinaire}px`);
check('la formation n’est écrite qu’une fois dans une cellule à deux stagiaires',
  (cellule2?.texte.match(/Pratique R489 Cat 3/g) || []).length === 1,
  cellule2?.texte.replace(/\s+/g, ' '));

// Les plannings globaux : mêmes bandes, et leurs lignes sont toutes égales —
// leurs cellules ne fusionnant pas, un nom réécrit à chaque demi-heure s'y
// repliait sur trois lignes et faisait des lignes de 74 px à côté de 42.
await p.goto(BASE + '/#/planning-formateur');
await p.waitForTimeout(1200);
const global = await p.evaluate(() => {
  const tbl = document.querySelector('#main table.planning');
  const trs = [...tbl.querySelectorAll('tr')].filter((tr) => tr.querySelector('td.day-col:not([colspan])'));
  return {
    n: trs.length,
    alt: trs.filter((tr) => tr.classList.contains('ligne-alt')).length,
    hauteurs: [...new Set(trs.map((tr) => Math.round(tr.getBoundingClientRect().height)))].sort((a, b) => a - b),
  };
});
check('le planning global porte aussi les bandes', global.alt > 0 && global.alt < global.n,
  `${global.alt} lignes teintées sur ${global.n}`);
check('et toutes ses lignes ont la même hauteur', global.hauteurs.length === 1,
  `${global.hauteurs.join(', ')} px sur ${global.n} lignes`);

await p.goto(BASE + '/#/semaine/39');
await p.waitForTimeout(800);
await p.screenshot({ path: artefact('grille-alignement.png'), fullPage: true });
check('aucune erreur JS', errs.length === 0, errs.join(' ; '));

const echecs = bilan();
await b.close();
process.exit(echecs ? 1 : 0);
