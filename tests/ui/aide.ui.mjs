import { lancerNavigateur, BASE, artefact } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let pass = 0, fail = 0;
const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${x ? ' — ' + x : ''}`); };

await page.goto(BASE + '/#/aide'); await page.waitForTimeout(900);
const t = await page.locator('#main').innerText();

check('page rendue', t.includes('Mode d'+String.fromCharCode(39)+'emploi') || t.includes('Mode d’emploi'));
check('légende : créneau libre neutre', /neutre/i.test(t) && /libre/i.test(t));
check('légende : vert = confirmée', /vert/i.test(t) && /confirm/i.test(t));
check('légende : jaune = pré-réservée', /jaune/i.test(t) && /pré-réserv/i.test(t));
check('légende : bleu = théorie', /bleu/i.test(t) && /théorie/i.test(t));
check('légende : violet = épreuve surveillée', /violet/i.test(t));
check('rouge réservé aux anomalies', /rouge[\s\S]{0,120}anomalie/i.test(t));
check('ancienne légende « rouge = occupé » absente', !/rouge\s*=\s*occup/i.test(t));
check('AIPR : surveillance, hors charge', /surveillance/i.test(t) && /charge/i.test(t));
check('YPAREO documenté', /YPAREO/.test(t));
check('écran CA documenté', /Chiffre d[’']affaires/.test(t) && /Points de vigilance/.test(t));
check('catalogue paramétrable documenté', /Catalogue des formations/i.test(t));
check('R485 : mention obsolète retirée', !/R485 non int/i.test(t));
check('R485 : mention à jour', /R485[\s\S]{0,80}catalogue/i.test(t));
check('durées renvoyées aux Paramètres', /catalogue[\s\S]{0,60}Param/i.test(t) || /Param[\s\S]{0,60}catalogue/i.test(t));
check('aucune erreur JS', errors.length === 0, errors.join(' ; '));
await page.screenshot({ path: artefact('aide.png'), fullPage: true });
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close(); process.exit(fail ? 1 : 0);
