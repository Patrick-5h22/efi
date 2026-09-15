// Authentification OAuth de la route MCP — le futur des jetons porteurs.
//
// Deux chemins cohabitent pendant la bascule :
//
//   OAuth          l'appelant présente un jeton émis par notre serveur
//                  d'autorisation, lié à son compte Microsoft CIPECMA.
//                  reservePar porte alors une identité réelle.
//   MCP_TOKENS     un jeton statique nominatif, ce qui existe aujourd'hui.
//
// Ce module ne s'occupe que du premier. api/_mcp-auth.js garde le second, et
// api/mcp.js les enchaîne. Le découpage n'est pas cosmétique : better-auth
// n'est chargé QUE si MCP_OAUTH vaut « 1 » (import dynamique plus bas), pour
// qu'une base d'authentification en panne n'empêche pas les jetons statiques
// de fonctionner. Ils sont, pour l'instant, le mode qui tourne en production.

export function oauthActif() {
  return process.env.MCP_OAUTH === '1';
}

// Domaine public de l'application. Doit correspondre trait pour trait à ce
// qu'annonce le serveur d'autorisation, sinon la vérification d'audience
// échoue et le message est peu parlant.
function domaine() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function adresseRessource() {
  return `${domaine()}/api/mcp`;
}

// Le vérificateur est coûteux à construire (il récupère le JWKS) : on le garde
// d'une invocation à l'autre, l'instance serverless étant réutilisée.
let verificateur = null;

async function obtenirVerificateur() {
  if (verificateur) return verificateur;
  const { createMcpProtectedRequestHandler } = await import('@better-auth/mcp');
  const base = domaine();
  verificateur = createMcpProtectedRequestHandler(
    {
      issuer: `${base}/api/auth`,
      audience: adresseRessource(),
      jwksUrl: `${base}/api/auth/jwks`,
    },
    // Le handler ne sert qu'à récupérer les revendications du jeton vérifié :
    // on ne traite pas la requête ici, api/mcp.js s'en charge.
    async (_requete, revendications) => Response.json({ revendications }),
  );
  return verificateur;
}

// Résout un nom lisible à partir du sujet du jeton. Le planning affiche
// reservePar à l'assistante : « NEAU Emmanuel » lui parle, un identifiant
// opaque non. Une requête indexée sur la table partagée, et seulement quand
// le jeton ne porte pas déjà le nom.
async function nomDuSujet(sub) {
  try {
    const { auth } = await import('./_auth.js');
    const ctx = await auth.$context;
    const u = await ctx.adapter.findOne({
      model: 'user',
      where: [{ field: 'id', value: sub }],
    });
    return u?.name || u?.email || null;
  } catch {
    return null; // la panne de nommage ne doit pas refuser un jeton valide
  }
}

/**
 * Tente d'identifier l'appelant par son jeton OAuth.
 *
 * @returns {Promise<{nom: string, sub: string} | null>} l'identité, ou null si
 *   le jeton n'est pas un jeton OAuth valable — auquel cas api/mcp.js essaiera
 *   les jetons statiques avant de refuser.
 */
export async function identifierParOAuth(req) {
  const brut = (req.headers?.authorization || '').trim();
  const m = /^Bearer\s+(\S+)$/i.exec(brut);
  if (!m) return null;

  // Un jeton OAuth est un JWT : trois segments séparés par des points. Un
  // jeton de MCP_TOKENS, tiré au hasard, n'en a aucun. Ce filtre évite de
  // lancer une vérification — et l'appel JWKS qui va avec — sur chaque
  // requête des commerciaux restés en jeton statique.
  if (m[1].split('.').length !== 3) return null;

  const verifier = await obtenirVerificateur();
  const reponse = await verifier(new Request(adresseRessource(), {
    method: 'POST',
    headers: { authorization: brut, 'content-type': 'application/json' },
    body: '{}',
  }));
  if (reponse.status !== 200) return null;

  const { revendications } = await reponse.json();
  const sub = revendications?.sub;
  if (!sub) return null;

  const nom = revendications.name || revendications.email || await nomDuSujet(sub) || sub;
  return { nom, sub };
}

/**
 * En-tête de défi à renvoyer sur un 401, pour que le client sache où commencer
 * l'autorisation. C'est ce que lit Claude pour lancer le flux : sans lui, il
 * abandonne sans rien dire d'exploitable.
 */
export function defiOAuth() {
  const base = domaine();
  const chemin = new URL(adresseRessource()).pathname;
  return `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${chemin}"`;
}
