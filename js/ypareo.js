// Export YPAREO — une ligne par PARCOURS, et non par séance.
//
// Demande d'Emmanuel (18/09/2026) : « à terme, nous devrions basculer
// l'inscription d'un stagiaire sur un parcours dans YPAREO sans distinction de
// la catégorie autrement que par un champ texte » —
//
//     Formation   = R489
//     Commentaire = Cat. 1A, 3, 5
//
// C'est une conséquence directe du regroupement, pas un calcul : le parcours
// donne la recommandation et la liste des catégories sans rien deviner. Sans
// lui, il aurait fallu inventer une règle pour décider quelles lignes d'un
// même stagiaire forment une seule inscription YPAREO — et se tromper le jour
// où le même candidat revient pour une autre vente.

import { formationByCode } from './config.js';
import { lignesDuParcours } from './store.js';

// Libellé de catégorie tel qu'il partira dans le champ texte. Le catalogue dit
// « Pratique R489 Cat 3 » ; YPAREO n'a besoin que de « Cat. 3 », la
// recommandation étant déjà dans la colonne Formation.
export function libelleCategorie(formation, code) {
  if (!formation) return code || '?';
  const label = formation.label || code || '';
  const cat = label.match(/Cat\.?\s*([A-Z0-9]+)/i);
  if (cat) return `Cat. ${cat[1]}`;
  // Dispositif sans catégorie (habilitation électrique, AIPR) : son libellé
  // vaut mieux qu'un « Cat. » vide.
  return label.replace(/^Pratique\s+/i, '');
}

// Une ligne d'export par parcours. Les séances annulées sont exclues ; un
// parcours entièrement annulé disparaît, car il n'y a plus d'inscription à
// transmettre.
export function lignesYpareo(state) {
  const out = [];
  for (const p of state.parcours || []) {
    const lignes = lignesDuParcours(state, p.id).filter((i) => i.statut !== 'annulee');
    if (!lignes.length) continue;

    const formations = lignes.map((i) => ({
      code: i.formation, f: formationByCode(state.formations, i.formation),
    }));
    const recos = [...new Set(formations.map((x) => x.f?.reco || x.code || '?'))].sort();
    const categories = [...new Set(formations.map((x) => libelleCategorie(x.f, x.code)))];
    const dates = lignes.map((i) => i.datePratique).filter(Boolean).sort();
    const types = [...new Set(lignes.map((i) => i.type))];
    const pre = lignes.every((i) => i.statut === 'pre');

    out.push({
      parcoursId: p.id,
      stagiaire: lignes[0].stagiaire,
      entreprise: lignes[0].entreprise || '',
      siret: lignes[0].siret || '',
      dossierYpareo: p.dossierYpareo || '',
      // « Formation » au sens YPAREO : la recommandation. Deux recommandations
      // dans un même parcours restent lisibles plutôt que réduites à une.
      formation: recos.join(' + '),
      commentaire: categories.join(', '),
      // Un parcours mélangeant Initial et Recyclage n'a pas de régime unique :
      // on les nomme tous les deux plutôt que d'en choisir un au hasard.
      regime: types.join(' + '),
      chiffreAffaires: p.chiffreAffaires ?? '',
      debut: dates[0] || '',
      fin: dates.at(-1) || '',
      seances: lignes.length,
      statut: pre ? 'pré-réservé' : 'confirmé',
    });
  }
  return out.sort((a, b) => (a.debut || '￿').localeCompare(b.debut || '￿')
    || a.stagiaire.localeCompare(b.stagiaire));
}

export const COLONNES_YPAREO = [
  ['stagiaire', 'Stagiaire'],
  ['entreprise', 'Entreprise'],
  ['siret', 'SIRET'],
  ['dossierYpareo', 'N° dossier YPAREO'],
  ['formation', 'Formation'],
  ['commentaire', 'Commentaire'],
  ['regime', 'Régime'],
  ['chiffreAffaires', 'Chiffre d’affaires'],
  ['debut', 'Début'],
  ['fin', 'Fin'],
  ['seances', 'Séances'],
  ['statut', 'Statut'],
];

export function ypareoCSV(state) {
  const sep = ';';
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lignes = lignesYpareo(state).map((l) =>
    COLONNES_YPAREO.map(([cle]) => cell(l[cle])).join(sep));
  // BOM : sans lui, Excel en français lit l'UTF-8 comme du latin-1 et rend
  // « Prérequis » en « PrÃ©requis ».
  return '﻿' + [COLONNES_YPAREO.map(([, t]) => cell(t)).join(sep), ...lignes].join('\r\n');
}
