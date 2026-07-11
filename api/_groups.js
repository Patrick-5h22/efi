// Gestion des groupes Entra ID (connexion Microsoft) — logique pure, testée.
//
// Deux variables d'environnement optionnelles :
//   MICROSOFT_ALLOWED_GROUPS  ids de groupes séparés par des virgules :
//                             seuls leurs membres peuvent se connecter via
//                             Microsoft (sinon : tout le tenant).
//   MICROSOFT_GROUP_ROLES     mapping id-de-groupe:role, séparés par des
//                             virgules, ex. « guid1:gestionnaire,guid2:commercial ».
//                             Le rôle le plus élevé l'emporte si plusieurs
//                             groupes correspondent.
//
// Prérequis côté Azure : App registration → Token configuration →
// « Add groups claim » (Security groups, Group ID) pour que le jeton
// d'identité contienne la liste `groups`.

const ROLE_PRIORITY = ['gestionnaire', 'assistante', 'commercial']; // du plus fort au plus faible

export function parseAllowedGroups(raw) {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseGroupRoles(raw) {
  const map = {};
  for (const pair of (raw || '').split(',')) {
    const [group, role] = pair.split(':').map((s) => s?.trim());
    if (group && ROLE_PRIORITY.includes(role)) map[group] = role;
  }
  return map;
}

export function isAllowed(groups, allowed) {
  if (!allowed.length) return true; // pas de restriction configurée
  return (groups || []).some((g) => allowed.includes(g));
}

export function roleFromGroups(groups, groupRoles) {
  const roles = (groups || []).map((g) => groupRoles[g]).filter(Boolean);
  if (!roles.length) return null; // aucun groupe mappé : rôle inchangé
  return ROLE_PRIORITY.find((r) => roles.includes(r)) || null;
}
