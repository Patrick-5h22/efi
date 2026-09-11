// Harnais commun aux suites navigateur.
//
// Ce qui variait d'une machine à l'autre — chemin du navigateur, URL de base,
// destination des captures — est regroupé ici, et nulle part ailleurs.
//
//   EFI_URL                 URL de l'application (défaut : serveur local)
//   PLAYWRIGHT_EXECUTABLE   binaire du navigateur, si non standard
//
// Les suites s'exécutent comme des scripts autonomes : elles affichent une
// ligne par vérification et sortent en 1 dès la première qui échoue. C'est
// tests/ui/run.mjs qui les enchaîne.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const BASE = process.env.EFI_URL || 'http://localhost:8080';

const ICI = dirname(fileURLToPath(import.meta.url));
const ARTEFACTS = join(ICI, '.artefacts');

// Les captures ne sont pas des assertions : elles servent à comprendre un
// échec après coup. Dossier ignoré par git, remis à plat à chaque exécution.
export function artefact(nom) {
  mkdirSync(ARTEFACTS, { recursive: true });
  return join(ARTEFACTS, nom);
}

export async function lancerNavigateur() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
}

// Compteur de vérifications partagé, pour que toutes les suites rendent le
// même format — lisible en CI comme en local.
export function compteur() {
  let pass = 0;
  let fail = 0;
  return {
    check(libelle, ok, detail = '') {
      if (ok) pass += 1; else fail += 1;
      console.log(`${ok ? '✓' : '✗'} ${libelle}${detail ? ' — ' + detail : ''}`);
    },
    bilan() {
      console.log(`\n${pass}/${pass + fail} OK`);
      return fail;
    },
  };
}
