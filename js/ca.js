// Suivi du chiffre d’affaires — agrégation des montants par mois, puis par
// recommandation (structure de l'onglet « Chiffre d’affaires » du classeur).
//
// Conventions :
//   • le montant est porté par le PARCOURS — une vente, un montant ;
//   • date de référence = la première date de pratique de ses séances ;
//   • un parcours dont toutes les séances sont annulées est exclu.
//
// Ce qui a changé, et pourquoi le contrôle de doublons a disparu. Le montant
// était auparavant porté par la LIGNE (1 stagiaire × 1 catégorie). Un dossier
// couvrant trois catégories occupait trois lignes, et le même montant recopié
// sur chacune comptait trois fois. Un contrôle signalait ce cas — sans jamais
// pouvoir le corriger, faute de savoir laquelle des trois portait la vérité.
//
// Le parcours supprime la cause : il n'y a plus qu'un endroit où écrire le
// montant. Le contrôle n'a plus d'objet, et le retirer vaut mieux que de le
// garder en décoration.
//
// Conséquence assumée sur la ventilation : un parcours « R489 Cat 1A + 3 + 5 »
// vendu 900 € ne se répartit pas entre ses trois catégories. Le répartir
// demanderait une règle que personne n'a donnée — au prorata des durées ? à
// parts égales ? — et qui serait une invention. On ventile donc par
// RECOMMANDATION, qui est ce qui se vend.

import { formationByCode } from './config.js';
import { fenetreAffichage } from './dates.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function moisLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MOIS[Number(m) - 1]} ${y}`;
}

export function fmtEuros(n) {
  return (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// Vue d'un parcours pour le chiffre d'affaires : son montant, ses séances
// vivantes, et ce qui se déduit d'elles.
//
// « recos » plutôt qu'une seule recommandation : la spécification décrit un
// parcours comme une recommandation et ses catégories, mais rien n'empêche
// d'en regrouper deux. Plutôt que d'en élire une, on les nomme toutes.
export function parcoursFactures(state) {
  const parLigne = new Map();
  for (const i of state.inscriptions) {
    if (i.parcoursId == null) continue;
    if (!parLigne.has(i.parcoursId)) parLigne.set(i.parcoursId, []);
    parLigne.get(i.parcoursId).push(i);
  }

  const out = [];
  for (const p of state.parcours || []) {
    if (p.chiffreAffaires == null) continue;
    const lignes = (parLigne.get(p.id) || []).filter((i) => i.statut !== 'annulee');
    if (!lignes.length) continue; // vente entièrement annulée
    const dates = lignes.map((i) => i.datePratique).filter(Boolean).sort();
    const recos = [...new Set(lignes.map((i) =>
      formationByCode(state.formations, i.formation)?.reco || i.formation || '?'))].sort();
    out.push({
      id: p.id,
      montant: p.chiffreAffaires,
      dossierYpareo: p.dossierYpareo,
      stagiaire: lignes[0].stagiaire,
      lignes,
      debut: dates[0] || null,
      recos,
      // Étiquette de ventilation : la recommandation quand il n'y en a qu'une,
      // sinon les deux nommées — jamais un choix arbitraire entre elles.
      cle: recos.join(' + '),
    });
  }
  return out;
}

// Années civiles proposables : celles des parcours facturés, plus celles
// couvertes par la fenêtre d'affichage.
export function anneesDisponibles(state) {
  const set = new Set();
  for (const p of parcoursFactures(state)) {
    if (p.debut) set.add(p.debut.slice(0, 4));
  }
  const fenetre = fenetreAffichage();
  for (const d of [fenetre.debut, fenetre.fin]) set.add(d.slice(0, 4));
  return [...set].sort();
}

export function caSummary(state, annee) {
  const an = String(annee || anneesDisponibles(state)[0] || new Date().getFullYear());
  const tous = parcoursFactures(state);

  // Les parcours sans aucune date de pratique ne tombent dans aucun mois : on
  // les isole au lieu de les diluer, pour qu'ils restent visibles.
  const sansDate = { count: 0, total: 0 };
  const retenus = [];
  for (const p of tous) {
    if (!p.debut) { sansDate.count += 1; sansDate.total += p.montant; continue; }
    if (p.debut.slice(0, 4) !== an) continue;
    retenus.push(p);
  }

  const parMois = new Map();
  const parReco = new Map();
  for (const p of retenus) {
    const ym = p.debut.slice(0, 7);
    if (!parMois.has(ym)) parMois.set(ym, new Map());
    const m = parMois.get(ym);
    m.set(p.cle, (m.get(p.cle) || 0) + p.montant);
    parReco.set(p.cle, (parReco.get(p.cle) || 0) + p.montant);
  }

  const mois = [...parMois.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, m]) => {
    const formations = [...m.entries()]
      .map(([code, total]) => ({ code, label: code, total }))
      .sort((a, b) => b.total - a.total);
    return { ym, label: moisLabel(ym), formations, total: formations.reduce((s, f) => s + f.total, 0) };
  });

  const formations = [...parReco.entries()]
    .map(([code, total]) => ({ code, label: code, total }))
    .sort((a, b) => b.total - a.total);

  const total = formations.reduce((s, f) => s + f.total, 0);
  const dossiers = new Set(retenus.map((p) => p.dossierYpareo).filter(Boolean));

  return {
    annee: an,
    mois,
    formations,
    total,
    // « lignes » compte désormais des VENTES et non des séances : c'est ce
    // que le total mesure, et le nom est conservé pour les vues.
    lignes: retenus.length,
    seances: retenus.reduce((s, p) => s + p.lignes.length, 0),
    dossiers: dossiers.size,
    sansDossier: retenus.filter((p) => !p.dossierYpareo).length,
    sansDate,
  };
}

// Un numéro YPAREO valide compte 10 chiffres. La saisie reste libre (les
// dossiers anciens peuvent différer) : on se contente de le signaler.
export function ypareoValide(v) {
  return /^\d{10}$/.test(String(v || '').trim());
}
