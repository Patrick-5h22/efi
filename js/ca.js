// Suivi du chiffre d’affaires — agrégation des montants saisis sur les
// inscriptions, par mois puis par formation (structure de l'onglet
// « Chiffre d’affaires » du classeur EFI).
//
// Conventions reprises du classeur :
//   • date de référence = date de la PRATIQUE ;
//   • les lignes annulées sont exclues ;
//   • le montant est porté par la LIGNE (1 stagiaire × 1 catégorie).
// Un même dossier YPAREO couvrant plusieurs catégories occupe donc plusieurs
// lignes : d'où le contrôle de doublons plus bas, qui signale un montant
// identique répété sur un même dossier — le cas où le CA serait compté deux
// fois. Aucun calcul métier n'en dépend : c'est une alerte de saisie.

import { formationByCode } from './config.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function moisLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MOIS[Number(m) - 1]} ${y}`;
}

export function fmtEuros(n) {
  return (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// Lignes qui portent un montant et comptent dans le CA
function lignesFacturees(state) {
  return state.inscriptions.filter((i) => i.statut !== 'annulee' && i.chiffreAffaires != null);
}

// Années civiles proposables : celles des pratiques facturées, plus celles
// couvertes par la période de planification.
export function anneesDisponibles(state) {
  const set = new Set();
  for (const i of lignesFacturees(state)) {
    if (i.datePratique) set.add(i.datePratique.slice(0, 4));
  }
  for (const d of [state.params?.periodStart, state.params?.periodEnd]) {
    if (d) set.add(d.slice(0, 4));
  }
  return [...set].sort();
}

export function caSummary(state, annee) {
  const an = String(annee || anneesDisponibles(state)[0] || new Date().getFullYear());
  const lignes = lignesFacturees(state);
  const label = (code) => formationByCode(state.formations, code)?.label || code || '(formation inconnue)';

  // Les lignes sans date de pratique ne tombent dans aucun mois : on les
  // isole au lieu de les diluer, pour qu'elles restent visibles.
  const sansDate = { count: 0, total: 0 };
  const retenues = [];
  for (const i of lignes) {
    if (!i.datePratique) { sansDate.count += 1; sansDate.total += i.chiffreAffaires; continue; }
    if (i.datePratique.slice(0, 4) !== an) continue;
    retenues.push(i);
  }

  // Mois × formation
  const parMois = new Map();
  const parFormation = new Map();
  for (const i of retenues) {
    const ym = i.datePratique.slice(0, 7);
    if (!parMois.has(ym)) parMois.set(ym, new Map());
    const m = parMois.get(ym);
    m.set(i.formation, (m.get(i.formation) || 0) + i.chiffreAffaires);
    parFormation.set(i.formation, (parFormation.get(i.formation) || 0) + i.chiffreAffaires);
  }

  const mois = [...parMois.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, m]) => {
    const formations = [...m.entries()]
      .map(([code, total]) => ({ code, label: label(code), total }))
      .sort((a, b) => b.total - a.total);
    return { ym, label: moisLabel(ym), formations, total: formations.reduce((s, f) => s + f.total, 0) };
  });

  const formations = [...parFormation.entries()]
    .map(([code, total]) => ({ code, label: label(code), total }))
    .sort((a, b) => b.total - a.total);

  const total = formations.reduce((s, f) => s + f.total, 0);
  const dossiers = new Set(retenues.map((i) => i.dossierYpareo).filter(Boolean));

  return {
    annee: an,
    mois,
    formations,
    total,
    lignes: retenues.length,
    dossiers: dossiers.size,
    sansDossier: retenues.filter((i) => !i.dossierYpareo).length,
    sansDate,
    doublons: doublonsDossier(retenues),
  };
}

// Même dossier + même montant sur plusieurs lignes : signe probable que le
// montant du dossier a été recopié sur chaque catégorie au lieu d'être
// réparti. Signalé, jamais corrigé automatiquement.
export function doublonsDossier(lignes) {
  const byKey = new Map();
  for (const i of lignes) {
    if (!i.dossierYpareo || !i.chiffreAffaires) continue;
    const key = `${i.dossierYpareo}|${i.chiffreAffaires}`;
    if (!byKey.has(key)) byKey.set(key, { dossier: i.dossierYpareo, montant: i.chiffreAffaires, stagiaire: i.stagiaire, lignes: 0 });
    byKey.get(key).lignes += 1;
  }
  return [...byKey.values()].filter((d) => d.lignes > 1).sort((a, b) => b.montant - a.montant);
}

// Un numéro YPAREO valide compte 10 chiffres. La saisie reste libre (les
// dossiers anciens peuvent différer) : on se contente de le signaler.
export function ypareoValide(v) {
  return /^\d{10}$/.test(String(v || '').trim());
}
