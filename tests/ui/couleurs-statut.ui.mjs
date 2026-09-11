// Code couleur aligné sur le classeur EFI : vert = confirmée, jaune =
// pré-réservée, bleu = théorie, violet = épreuve AIPR, neutre = libre.
import { lancerNavigateur, BASE, artefact } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let pass = 0, fail = 0;
const check = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${extra ? ' — ' + extra : ''}`); };

// Le navigateur renvoie les couleurs telles qu'écrites (oklch, color(srgb …)).
// On les résout en RGB réel via un canvas, puis on classe la teinte en HSL.
const bgOf = async (loc) => {
  const { css, rgb } = await loc.evaluate((el) => {
    const css = getComputedStyle(el).backgroundColor;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return { css, rgb: [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) };
  });
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  // Près du blanc, la saturation HSL s'emballe sur un écart d'un point de
  // quantification : on juge sur l'écart réel entre canaux.
  const teinte = d < 0.035 ? 'neutre'
    : h >= 40 && h < 95 ? 'jaune'
    : h >= 95 && h < 175 ? 'vert'
    : h >= 195 && h < 265 ? 'bleu'
    : h >= 265 && h < 340 ? 'violet'
    : 'autre';
  return { css, teinte, detail: `${css} → teinte ${Math.round(h)}° écart ${d.toFixed(3)}` };
};

await page.goto(BASE + '/');
await page.evaluate(async () => {
  const { DEFAULT_PARAMS, DEFAULT_FORMATIONS, DEFAULT_TEAM } = await import('/js/config.js');
  const state = {
    version: 1, params: DEFAULT_PARAMS, formations: DEFAULT_FORMATIONS, team: DEFAULT_TEAM,
    openDays: ['2026-09-01', '2026-09-02'], dayAssignments: {}, dayPresence: {}, nextId: 5,
    inscriptions: [
      // Confirmée (vert) — pratique 08:00
      { id: 1, stagiaire: 'CONF Stagiaire', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee', modeTheorie: 'distance' },
      // Pré-réservée (jaune) — pratique 14:00
      { id: 2, stagiaire: 'PRE Stagiaire', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 840, formateurId: 'p1', statut: 'pre', modeTheorie: 'distance' },
      // Théorie collective (bleu) — test théorique 11:00, grille testeur
      { id: 3, stagiaire: 'THEO Stagiaire', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-02', debutPratique: 480, formateurId: 'p2',
        dateTheorie: '2026-09-01', dateTestPratique: '2026-09-02', debutTestPratique: 600, testeurId: 'p1', statut: 'confirmee', modeTheorie: 'distance' },
      // Épreuve AIPR (violet) — 15:00, grille testeur
      { id: 4, stagiaire: 'AIPR Candidat', formation: 'AIPR', type: 'Initial', datePratique: '2026-09-01', debutPratique: 900, testeurId: 'p2', statut: 'confirmee', modeTheorie: 'distance' },
    ],
  };
  localStorage.setItem('efi-planning-v1', JSON.stringify(state));
});
await page.reload(); await page.waitForTimeout(700);

await page.goto(BASE + '/#/semaine/36'); await page.waitForTimeout(600);
const gridF = page.locator('.card:has(h2:text("FORMATEUR"))');
const gridT = page.locator('.card:has(h2:text("TESTEUR"))');

const conf = await bgOf(gridF.locator('td.slot-busy:not(.slot-pre)').first());
check('réservation confirmée en vert', conf.teinte === 'vert', conf.detail);

const pre = await bgOf(gridF.locator('td.slot-busy.slot-pre').first());
check('pré-réservation en jaune', pre.teinte === 'jaune', pre.detail);

const theo = await bgOf(gridT.locator('td.slot-theory').first());
check('théorie en bleu', theo.teinte === 'bleu', theo.detail);

const exam = await bgOf(gridT.locator('td.slot-exam').first());
check('épreuve AIPR en violet', exam.teinte === 'violet', exam.detail);

const libre = await bgOf(gridF.locator('td.slot-free').first());
check('créneau libre en neutre (plus de vert)', libre.teinte === 'neutre', libre.detail);

check('les quatre teintes sont distinctes',
  new Set([conf.css, pre.css, theo.css, exam.css]).size === 4);

// Légende conforme à la nouvelle convention
const legend = await page.locator('.legend').first().innerText();
check('légende « Libre »', legend.includes('Libre'));
check('légende « Confirmée » et « Pré-réservée »', legend.includes('Confirmée') && legend.includes('Pré-réservée'));
check('légende sans « Disponible » ni « Occupé »', !legend.includes('Disponible') && !legend.includes('Occupé'), legend.replace(/\n/g, ' · '));

await page.locator('.card:has(h2:text("FORMATEUR"))').screenshot({ path: artefact('couleurs-semaine.png') });

// Cohérence avec la liste des inscriptions
await page.goto(BASE + '/#/inscriptions'); await page.waitForTimeout(500);
const rowConf = await bgOf(page.locator('tr.row-confirmed:not(.row-error)').first());
const rowPre = await bgOf(page.locator('tr.row-pre:not(.row-error)').first());
check('ligne confirmée teintée vert', rowConf.teinte === 'vert', rowConf.detail);
check('ligne pré-réservée teintée jaune', rowPre.teinte === 'jaune', rowPre.detail);
await page.locator('.table-wrap').first().screenshot({ path: artefact('couleurs-inscriptions.png') });

// Le thème sombre garde la même sémantique
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.goto(BASE + '/#/semaine/36'); await page.waitForTimeout(500);
const confDark = await bgOf(gridF.locator('td.slot-busy:not(.slot-pre)').first());
const theoDark = await bgOf(gridT.locator('td.slot-theory').first());
check('sombre : confirmée toujours verte', confDark.teinte === 'vert', confDark.detail);
check('sombre : théorie toujours bleue', theoDark.teinte === 'bleu', theoDark.detail);

check('aucune erreur JS', errors.length === 0, errors.join(' ; '));
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close();
process.exit(fail ? 1 : 0);
