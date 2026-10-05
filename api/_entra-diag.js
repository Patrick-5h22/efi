// Que valent réellement les deux variables qui bornent la connexion Microsoft ?
// Logique pure, testée, sans accès réseau ni base.
//
// Pourquoi ce diagnostic existe. Deux variables décident à elles seules de QUI
// peut entrer, et toutes deux échouent en silence vers le plus permissif :
//
//   MICROSOFT_TENANT_ID        absente → api/_auth.js retombe sur « common »,
//                              c'est-à-dire n'importe quel compte Microsoft,
//                              y compris personnel — alors que le commentaire
//                              d'à côté dit « restreint au tenant CIPECMA ».
//   MICROSOFT_ALLOWED_GROUPS   vide → isAllowed() renvoie true pour tout le
//                              monde (api/_groups.js).
//
// Prises ensemble et laissées vides, elles ouvrent la connexion à la Terre
// entière sans qu'aucune erreur ne se produise jamais. « Elle est renseignée »
// ne suffit donc pas : « common » est une valeur renseignée.
//
// Ce que le diagnostic NE fait PAS : rendre les valeurs. Il en donne la forme,
// la longueur et les premiers caractères — de quoi reconnaître la bonne valeur
// sans la recopier nulle part.

// Les trois tenants « méta » d'Entra : ce ne sont pas des organisations mais
// des points d'entrée multi-organisations.
const TENANTS_OUVERTS = {
  common: 'tout compte Microsoft, professionnel OU personnel',
  organizations: 'tout compte professionnel, quelle que soit l’organisation',
  consumers: 'tout compte Microsoft personnel',
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Les premiers caractères et la longueur — assez pour reconnaître une valeur,
// pas assez pour la reconstituer.
export function masquer(valeur, debut = 8) {
  if (!valeur) return null;
  const v = String(valeur);
  return v.length <= debut ? v : `${v.slice(0, debut)}… (${v.length} car.)`;
}

export function diagnostiquerTenant(brut) {
  const v = (brut || '').trim();
  if (!v) {
    return {
      renseignee: false, restreint: false, apercu: null,
      forme: 'absente',
      effet: `api/_auth.js retombe sur « common » : ${TENANTS_OUVERTS.common}`,
    };
  }
  const bas = v.toLowerCase();
  if (TENANTS_OUVERTS[bas]) {
    return {
      renseignee: true, restreint: false, apercu: v,
      forme: 'tenant ouvert',
      effet: `« ${bas} » — ${TENANTS_OUVERTS[bas]}`,
    };
  }
  const forme = GUID.test(v) ? 'identifiant de tenant (GUID)'
    : /\./.test(v) ? 'domaine de tenant'
      : 'valeur inattendue';
  return {
    renseignee: true,
    // Une « valeur inattendue » n'est pas un tenant reconnaissable : Entra la
    // refusera. On ne la compte donc pas comme une restriction valide.
    restreint: forme !== 'valeur inattendue',
    apercu: masquer(v),
    forme,
    effet: forme === 'valeur inattendue'
      ? 'ni GUID ni domaine — Entra rejettera l’autorisation'
      : 'une seule organisation est admise',
  };
}

export function diagnostiquerGroupes(brut) {
  const ids = (brut || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return {
      renseignee: false, restreint: false, nombre: 0, apercus: [],
      effet: 'vide — isAllowed() accepte tout le monde, sans filtre de groupe',
    };
  }
  return {
    renseignee: true, restreint: true, nombre: ids.length,
    apercus: ids.map((i) => masquer(i)),
    effet: `${ids.length} groupe(s) autorisé(s) — les autres sont refusés`,
  };
}

// Le verdict ne porte pas sur chaque variable prise à part mais sur ce
// qu'elles laissent passer ENSEMBLE : il suffit que l'une des deux restreigne
// pour qu'un inconnu ne puisse pas entrer.
export function diagnostiquerEntra(env = process.env) {
  const tenant = diagnostiquerTenant(env.MICROSOFT_TENANT_ID);
  const groupes = diagnostiquerGroupes(env.MICROSOFT_ALLOWED_GROUPS);
  const configure = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);

  let niveau; let resume;
  if (!configure) {
    niveau = 'inactif';
    resume = 'la connexion Microsoft est désactivée (CLIENT_ID ou CLIENT_SECRET manquant)';
  } else if (tenant.restreint && groupes.restreint) {
    niveau = 'ok';
    resume = 'double barrière : une seule organisation, et seulement certains groupes';
  } else if (tenant.restreint) {
    niveau = 'ok';
    resume = 'toute l’organisation peut se connecter, mais elle seule';
  } else if (groupes.restreint) {
    niveau = 'attention';
    resume = 'aucune restriction d’organisation : seuls les groupes retiennent. '
      + 'Un compte extérieur membre d’un groupe autorisé entrerait';
  } else {
    niveau = 'alerte';
    resume = 'AUCUNE barrière : n’importe quel compte Microsoft peut se connecter '
      + 'et se voir créer un compte';
  }

  return { configure, tenant, groupes, niveau, resume };
}
