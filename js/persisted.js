// Champs du planning réellement enregistrés dans la base partagée.
//
// Liste unique et volontairement isolée : le navigateur (js/db.js) et le
// proxy authentifié (api/state.js) s'y réfèrent tous les deux. Elle était
// auparavant recopiée de chaque côté, et c'est ainsi que « dayPresence »
// s'est perdu en chemin — modifié dans l'application, jamais transmis à la
// base, donc invisible des autres postes. Ajouter un champ persistant se
// fait ici, et nulle part ailleurs.
//
// N'y figurent que des données saisies : tout ce que le moteur recalcule
// (plannings, anomalies, sessions de théorie) reste dérivé.

export const PERSISTED_FIELDS = [
  'params',         // paramètres généraux (horaires, durées, pause, capacités)
  'formations',     // catalogue des produits
  'team',           // intervenants et habilitations
  'openDays',       // jours ouverts EFI
  'dayAssignments', // intervenant du jour
  'dayPresence',    // présence des intervenants par jour
  'inscriptions',   // lignes stagiaire × catégorie
];

// Ne retient que les champs persistés, en ignorant ceux qui manquent — un
// état venu d'une version antérieure n'a pas à être complété ici : c'est le
// rôle de migrate() au chargement.
export function pickPersisted(state) {
  const out = {};
  if (!state || typeof state !== 'object') return out;
  for (const key of PERSISTED_FIELDS) {
    if (state[key] !== undefined) out[key] = state[key];
  }
  return out;
}
