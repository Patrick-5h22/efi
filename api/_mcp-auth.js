// Authentification du serveur MCP : un jeton porteur par commercial.
//
// Les jetons sont déclarés côté serveur uniquement, dans la variable
// d'environnement MCP_TOKENS, sous la forme :
//
//   MCP_TOKENS="Jean Dupont=xxxxxxxx,Marie Martin=yyyyyyyy"
//
// Nommer chaque jeton sert à deux choses : tracer qui a pré-réservé, et
// pouvoir en révoquer un seul sans couper tout le monde.
//
// Choix de sûreté : sans MCP_TOKENS configuré, la route est FERMÉE. Un
// déploiement où la variable manque ne doit pas ouvrir le planning à tous.
//
// Les jetons ne sont jamais journalisés ni renvoyés dans une réponse.

import { createHash, timingSafeEqual } from 'node:crypto';

function empreinte(v) {
  return createHash('sha256').update(String(v), 'utf8').digest();
}

// Comparaison à temps constant : on compare les empreintes, de longueur fixe,
// pour ne pas révéler la longueur du jeton attendu.
function memeJeton(a, b) {
  return timingSafeEqual(empreinte(a), empreinte(b));
}

function jetonsDeclares() {
  const brut = process.env.MCP_TOKENS;
  if (!brut || !brut.trim()) return null; // non configuré → route fermée
  const out = [];
  for (const part of brut.split(',')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const nom = part.slice(0, i).trim();
    const jeton = part.slice(i + 1).trim();
    if (nom && jeton) out.push({ nom, jeton });
  }
  return out.length ? out : null;
}

function jetonPresente(req) {
  const brut = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(brut.trim());
  return m ? m[1].trim() : null;
}

// Renvoie { nom } si le porteur est reconnu. Sinon lève une erreur portant un
// statut HTTP : 503 si le serveur n'est pas configuré, 401 sinon.
export function identifierCommercial(req) {
  const declares = jetonsDeclares();
  if (!declares) {
    const err = new Error('Serveur MCP non configuré : aucun jeton déclaré (MCP_TOKENS).');
    err.status = 503;
    throw err;
  }

  const presente = jetonPresente(req);
  if (!presente) {
    const err = new Error('Jeton manquant. Utilisez l’en-tête « Authorization: Bearer <jeton> ».');
    err.status = 401;
    throw err;
  }

  // On parcourt toute la liste, sans court-circuit, pour que le temps de
  // réponse ne dépende pas de la position du jeton valide.
  let trouve = null;
  for (const d of declares) {
    if (memeJeton(presente, d.jeton)) trouve = trouve || d.nom;
  }
  if (!trouve) {
    const err = new Error('Jeton invalide.');
    err.status = 401;
    throw err;
  }
  return { nom: trouve };
}
