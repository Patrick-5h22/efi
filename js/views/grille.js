// Largeurs des grilles de planning, en un seul endroit.
//
// Les colonnes sont à largeur FIXE (css/style.css, « table-layout: fixed ») :
// sans cela chaque colonne se dimensionne sur son contenu, une demi-heure
// occupée devient large, une demi-heure vide se rétracte, et les deux grilles
// de la vue Semaine — formateur et testeur — n'ont plus les mêmes largeurs :
// 10:00 chez l'un ne tombe plus sous 10:00 chez l'autre.
//
// La largeur fixe supprimant tout plancher par cellule, c'est au tableau de
// porter sa largeur minimale ; en deçà, c'est à son conteneur de défiler.

export const LARGEUR_JOUR = 104;      // colonne « Jour »
export const LARGEUR_QUI = 112;       // colonne « Intervenant », quand elle existe
export const LARGEUR_CRENEAU = 58;    // une demi-heure

// Largeur en deçà de laquelle la grille défile plutôt que de se comprimer.
export function largeurMinGrille(nbCreneaux, { intervenant = false } = {}) {
  return LARGEUR_JOUR + (intervenant ? LARGEUR_QUI : 0) + nbCreneaux * LARGEUR_CRENEAU;
}
