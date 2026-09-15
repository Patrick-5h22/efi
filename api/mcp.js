// Serveur MCP du planning EFI, à destination des commerciaux en clientèle.
//
//   POST /api/mcp   JSON-RPC 2.0 (transport « Streamable HTTP », sans session)
//
// Ce fichier ne décide de rien : il authentifie, transporte et accède à la
// base. Les deux outils et tout le métier sont dans js/mcp.js, testable sans
// serveur.
//
// Sans session : chaque requête est autonome, authentifiée par son jeton
// porteur. Pas de flux SSE, donc pas de notifications serveur → client — ce
// dont aucun des deux outils n'a besoin.

import { identifierCommercial } from './_mcp-auth.js';
import { oauthActif, identifierParOAuth, defiOAuth } from './_mcp-oauth.js';
import { loadState, saveState, relireSiModifie, conflitEcriture } from './_planning.js';
import { outils, chercherCreneaux, preReserver } from '../js/mcp.js';

const SERVEUR = { name: 'efi-planning', version: '1.0.0' };
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// --- Réponses JSON-RPC ------------------------------------------------------

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const ko = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

// Une erreur métier (catégorie inconnue, plus de créneau, planning modifié)
// n'est pas une panne : elle revient comme résultat, pour que l'assistant la
// lise et la reformule au commercial.
const texte = (id, message, isError = false) => ok(id, {
  content: [{ type: 'text', text: message }],
  isError,
});

// --- Outils -----------------------------------------------------------------

async function appelerOutil(nom, args, commercial) {
  const brut = await loadState();

  if (nom === 'chercher_creneaux') {
    return chercherCreneaux(brut, args).texte;
  }

  if (nom === 'pre_reserver') {
    let sortie = preReserver(brut, args, { par: commercial.nom });

    // La sauvegarde remplace l'état entier : on relit juste avant d'écrire. Si
    // le planning a bougé pendant notre calcul, on ne l'écrase pas — on
    // recalcule sur la version fraîche. preReserver refuse de lui-même si le
    // jour demandé n'est plus tenable, donc rien ne peut être posé de travers.
    const frais = await relireSiModifie(brut);
    if (frais) {
      sortie = preReserver(frais, args, { par: commercial.nom });
      // Deux collisions de suite : on n'insiste pas, le commercial reprend sa
      // recherche plutôt que de tourner en boucle.
      if (await relireSiModifie(frais)) throw conflitEcriture();
    }

    await saveState(sortie.state);
    return sortie.texte;
  }

  const err = new Error(`Outil inconnu : ${nom}`);
  err.code = -32601;
  throw err;
}

// --- Acheminement JSON-RPC --------------------------------------------------

async function traiter(message, commercial) {
  const { id, method, params } = message || {};
  const notification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const demandee = params?.protocolVersion;
      return ok(id, {
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVEUR,
        instructions: 'Planning des formations pratiques et tests EFI. '
          + 'chercher_creneaux propose des dates réellement tenables ; pre_reserver bloque '
          + 'un créneau sans confirmer l’inscription. Les horaires sont en heures locales du '
          + 'centre et les dates au format AAAA-MM-JJ.',
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notification : aucune réponse

    case 'ping':
      return ok(id, {});

    case 'tools/list': {
      const brut = await loadState();
      return ok(id, { tools: outils(brut) });
    }

    case 'tools/call': {
      const nom = params?.name;
      if (!nom) return ko(id, -32602, 'Nom d’outil manquant.');
      try {
        return texte(id, await appelerOutil(nom, params?.arguments || {}, commercial));
      } catch (e) {
        if (e.code === -32601) return ko(id, -32601, e.message);
        // Erreur métier ou conflit d'écriture : le commercial doit la lire.
        if (e.metier || e.status === 409) return texte(id, e.message, true);
        throw e;
      }
    }

    default:
      if (notification) return null;
      return ko(id, -32601, `Méthode inconnue : ${method}`);
  }
}

// --- Point d'entrée HTTP ----------------------------------------------------

function entetes(res) {
  // Jeton porteur, donc pas de cookie : une origine ouverte n'accorde aucun
  // accès à elle seule.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  entetes(res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ message: 'Serveur MCP : POST uniquement (transport sans session, pas de flux SSE).' });
  }

  // Deux authentifications cohabitent le temps de la bascule. L'OAuth passe en
  // premier : c'est celle qui porte une identité réelle, et un jeton statique
  // ne peut pas être confondu avec un jeton signé. Si l'OAuth ne reconnaît
  // rien, on retombe sur MCP_TOKENS — ce qui fait tourner la production
  // aujourd'hui, et qui ne doit pas cesser de marcher parce qu'on prépare
  // la suite.
  let commercial = null;
  if (oauthActif()) {
    try {
      commercial = await identifierParOAuth(req);
    } catch {
      commercial = null; // panne de vérification : on laisse sa chance au repli
    }
  }

  if (!commercial) {
    try {
      commercial = identifierCommercial(req);
    } catch (e) {
      // 503 « aucun jeton statique déclaré » ne vaut plus quand l'OAuth est
      // ouvert : la route n'est pas fermée, elle attend une autorisation.
      const statut = (e.status === 503 && oauthActif()) ? 401 : (e.status || 401);

      // Le défi se pose sur le statut FINAL, pas sur celui de l'erreur reçue.
      // La nuance a coûté cher : sans MCP_TOKENS — c'est-à-dire en OAuth seul,
      // la configuration cible — identifierCommercial lève un 503. En testant
      // « e.status === 401 », le défi n'était jamais posé dans le seul cas qui
      // compte vraiment, et le connecteur MCP abandonnait sans rien dire.
      if (statut === 401) {
        res.setHeader('WWW-Authenticate', oauthActif() ? defiOAuth() : 'Bearer realm="efi-planning"');
      }

      const message = statut === 401 && oauthActif()
        ? 'Autorisation requise. Connectez-vous avec votre compte CIPECMA.'
        : e.message;
      return res.status(statut).json({ message });
    }
  }

  const corps = req.body;
  if (!corps || typeof corps !== 'object') {
    return res.status(400).json(ko(null, -32700, 'Corps JSON-RPC illisible.'));
  }

  try {
    // Un lot de requêtes est permis par JSON-RPC ; on le gère en série, l'état
    // partagé n'aimant pas les écritures concurrentes.
    if (Array.isArray(corps)) {
      const sorties = [];
      for (const m of corps) {
        const r = await traiter(m, commercial);
        if (r) sorties.push(r);
      }
      return sorties.length ? res.status(200).json(sorties) : res.status(202).end();
    }

    const sortie = await traiter(corps, commercial);
    return sortie ? res.status(200).json(sortie) : res.status(202).end();
  } catch (e) {
    const id = Array.isArray(corps) ? null : (corps.id ?? null);
    // 503 = mauvaise configuration serveur, le reste = panne amont.
    const statut = e.status === 503 ? 503 : 200;
    return res.status(statut).json(ko(id, -32603, e.message || 'Erreur interne.'));
  }
}
