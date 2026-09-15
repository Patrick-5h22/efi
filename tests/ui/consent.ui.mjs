// Écran d'autorisation OAuth, vu par un navigateur.
//
// Le parcours complet — autorisation, consentement, retour avec un code — a
// été éprouvé en local contre un vrai PostgreSQL et un vrai serveur Better
// Auth. Il ne peut pas tourner ici : la CI n'a ni base d'authentification ni
// fonctions serverless, seulement un serveur de fichiers.
//
// Ce qui est vérifié ci-dessous, c'est ce que la page doit faire SANS dorsale,
// et d'abord son invariant de sûreté : sans session, aucun bouton
// d'autorisation ne doit apparaître. Une page qui échoue en affichant quand
// même « Autoriser » serait un écran de consentement décoratif.

import { lancerNavigateur, BASE, artefact } from './_harness.mjs';
const browser = await lancerNavigateur();
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let pass = 0, fail = 0;
const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${l}${x ? ' — ' + x : ''}`); };

const visible = (sel) => page.locator(sel).isVisible();

// --- Ouverte à la main, sans demande en cours ---
await page.goto(BASE + '/consent.html');
await page.waitForTimeout(400);

check('page servie', (await page.title()).includes('Autorisation'));
check('sans demande : le titre le dit', (await page.locator('#titre').innerText()).includes('Rien à autoriser'));
check('sans demande : message explicite', /ouvrir par une application/i.test(await page.locator('#erreur').innerText()));
check('sans demande : aucun bouton d’autorisation', !(await visible('#corps')));

// --- Avec une demande, mais sans dorsale d'authentification ---
// Le serveur de test ne sert pas /api/auth : get-session échoue. La page doit
// alors refuser d'afficher le consentement, pas l'afficher « au cas où ».
const query = '?response_type=code&client_id=abc&scope=openid+profile'
  + '&redirect_uri=https%3A%2F%2Fexemple.test%2Fretour&state=x&sig=faux';
await page.goto(BASE + '/consent.html' + query);
await page.waitForTimeout(600);

check('sans session : les boutons restent cachés', !(await visible('#corps')));
check('sans session : « Autoriser » inaccessible', !(await visible('#accepter')));
check('sans session : connexion proposée', await visible('#connexion'));
check('sans session : le titre demande la connexion',
  (await page.locator('#titre').innerText()).includes('Connexion requise'));

// --- Rédaction : ne pas présumer du genre de qui lit ---
const texte = await page.locator('main').innerText();
check('aucun accord au féminin présumé', !/Connectée|connectée/.test(texte), texte.slice(0, 60));

// --- Robustesse ---
check('aucune erreur JS', errors.length === 0, errors.join(' / '));

await page.screenshot({ path: artefact('consentement.png') });
console.log(`\n${pass}/${pass + fail} OK`);
await browser.close();
process.exit(fail ? 1 : 0);
