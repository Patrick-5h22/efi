// Lance les suites navigateur, l'une après l'autre.
//
// Démarre le serveur statique s'il n'écoute pas déjà, exécute chaque suite
// dans son propre processus (localStorage et état de page repartent donc à
// zéro), et rend un exit code non nul dès qu'une suite échoue.
//
//   npm run test:ui                 toutes les suites
//   npm run test:ui -- pause aide   uniquement celles dont le nom correspond
//
// Contre une application déjà déployée : EFI_URL=https://… npm run test:ui
// (les suites écrivent dans localStorage — ne pas viser la production).

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const PORT = Number(process.env.EFI_PORT || 8080);
const BASE = process.env.EFI_URL || `http://localhost:${PORT}`;
const externe = !!process.env.EFI_URL;

const filtres = process.argv.slice(2);
const suites = readdirSync(ICI)
  .filter((f) => f.endsWith('.ui.mjs'))
  .filter((f) => !filtres.length || filtres.some((q) => f.includes(q)))
  .sort();

if (!suites.length) {
  console.error(filtres.length ? `Aucune suite ne correspond à : ${filtres.join(', ')}` : 'Aucune suite trouvée.');
  process.exit(1);
}

async function repond() {
  try {
    const res = await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function attendre(limiteMs = 15000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (await repond()) return true;
    await new Promise((r) => { setTimeout(r, 250); });
  }
  return false;
}

let serveur = null;
if (await repond()) {
  console.log(`Serveur déjà en écoute sur ${BASE}`);
} else if (externe) {
  console.error(`✗ ${BASE} ne répond pas.`);
  process.exit(1);
} else {
  console.log(`Démarrage du serveur statique sur le port ${PORT}…`);
  serveur = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: RACINE, stdio: 'ignore', detached: false,
  });
  if (!await attendre()) {
    console.error('✗ le serveur statique n’a pas démarré.');
    serveur.kill();
    process.exit(1);
  }
}

const arreter = () => { if (serveur && !serveur.killed) serveur.kill(); };
process.on('exit', arreter);
process.on('SIGINT', () => { arreter(); process.exit(130); });

function executer(suite) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [join(ICI, suite)], {
      stdio: 'inherit',
      env: { ...process.env, EFI_URL: BASE },
    });
    p.on('close', (code) => resolve(code ?? 1));
  });
}

const echecs = [];
for (const suite of suites) {
  console.log(`\n${'─'.repeat(58)}\n${suite}\n${'─'.repeat(58)}`);
  const code = await executer(suite);
  if (code !== 0) echecs.push(suite);
}

console.log(`\n${'═'.repeat(58)}`);
if (echecs.length) {
  console.log(`✗ ${echecs.length} suite(s) en échec : ${echecs.join(', ')}`);
  console.log(`  (captures éventuelles dans tests/ui/.artefacts/)`);
} else {
  console.log(`✓ ${suites.length} suite(s) au vert`);
}

arreter();
process.exit(echecs.length ? 1 : 0);
