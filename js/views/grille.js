// Largeurs, hauteur de ligne et bandes des grilles de planning, en un seul
// endroit.
//
// Les colonnes sont à largeur FIXE (css/style.css, « table-layout: fixed ») :
// sans cela chaque colonne se dimensionne sur son contenu, une demi-heure
// occupée devient large, une demi-heure vide se rétracte, et les deux grilles
// de la vue Semaine — formateur et testeur — n'ont plus les mêmes largeurs :
// 10:00 chez l'un ne tombe plus sous 10:00 chez l'autre.
//
// La largeur fixe supprimant tout plancher par cellule, c'est au tableau de
// porter sa largeur minimale ; en deçà, c'est à son conteneur de défiler.

import { dayOfWeek, fmtJourSemaine, fmtJourMois } from '../dates.js';

// « Jour » ne porte plus que sa date, en gros : « 05/10 » en 28 px mesure
// 86 px, d'où les 100 px de la colonne — mesuré, pas estimé. La charge
// du jour par formateur (« MEDAN 01h30 / 06h00 ») a rejoint l'intervenant, à
// qui elle appartient — d'où les 142 px de cette colonne-là, sans quoi la
// ligne de charge se replie.
//
// Dans les plannings globaux, qui n'ont pas de colonne « Intervenant », la
// colonne « Jour » reste la première et garde son en-tête d'origine.
export const LARGEUR_JOUR = 100;      // colonne « Jour »
export const LARGEUR_QUI = 142;       // colonne « Intervenant », quand elle existe
export const LARGEUR_CRENEAU = 58;    // une demi-heure

// Hauteur de ligne uniforme, pour la vue Semaine seulement. Une cellule
// occupée y écrit trois lignes — nom, formation, intervenant — là où un jour
// fermé n'en écrit qu'une : à hauteur libre, la grille montait et descendait
// en escalier. 46 px logent les trois lignes ; c'est un plancher, une cellule
// à deux stagiaires pousse encore sa ligne plutôt que de rogner un nom.
//
// Portée à 66 px quand l'en-tête de jour est passé en gros : le bloc du jour
// y écrit trois lignes — jour de la semaine, date en 28 px, charge — et 46 px
// les écrasait. C'est toujours un plancher, pas un plafond.
export const HAUTEUR_LIGNE = 66;

// Les plannings globaux ont leur propre hauteur, plus courte : 86 jours à
// 46 px feraient quatre mille pixels. Leurs lignes n'étaient pas égales non
// plus — 42 px un jour fermé, 74 px un jour chargé — parce que leurs cellules
// ne fusionnent pas : un nom de stagiaire y est réécrit à chaque demi-heure et
// se replie sur trois lignes dans 58 px. Une ligne par cellule, coupée par des
// points de suspension, rend la page à la fois régulière et deux fois plus
// courte ; l'infobulle continue de donner le nom entier (voir
// « .planning-global » dans css/style.css).
export const HAUTEUR_LIGNE_GLOBALE = 28;

// Largeur en deçà de laquelle la grille défile plutôt que de se comprimer.
export function largeurMinGrille(nbCreneaux, { intervenant = false } = {}) {
  return LARGEUR_JOUR + (intervenant ? LARGEUR_QUI : 0) + nbCreneaux * LARGEUR_CRENEAU;
}

// Style d'attribut du tableau : largeur minimale, et hauteur de ligne quand
// la vue la demande — les seules valeurs que le CSS ne peut pas connaître
// seul, le nombre de créneaux venant des paramètres.
export function styleGrille(nbCreneaux, { intervenant = false, hauteur = HAUTEUR_LIGNE } = {}) {
  return `min-width:${largeurMinGrille(nbCreneaux, { intervenant })}px;--h-ligne:${hauteur}px`;
}

// En-tête de jour des grilles de semaine : le jour de la semaine en petites
// capitales, la DATE en gros, et ce que la vue veut ajouter en dessous (la
// charge du jour par formateur).
//
// Pourquoi si gros : l'alternance claire/foncée seule ne suffisait pas à voir
// où une journée commence et où elle finit. Le trait qui encadre chaque
// journée s'en charge désormais (css/style.css), et la date en 28 px se lit
// sans chercher la colonne de gauche.
//
// Le jour s'écrit EN ENTIER, plus en trois lettres. « DIMANCHE », le plus
// long, mesure 66 px en 10 px maigre — la colonne en offre 88, puisque c'est
// la date qui la dimensionne. Abréger ne gagnait donc aucune place ; cela
// coûtait seulement une lecture (« JEU » se cherche, « JEUDI » se lit).
export function celluleJour(date) {
  return `<td class="day-col jour-bloc">`
    + `<span class="jour-sem">${fmtJourSemaine(date)}</span>`
    + `<span class="jour-date">${fmtJourMois(date)}</span>`
    + '</td>';
}

// Une ligne sur deux est teintée (voir « ligne-alt » dans css/style.css).
//
// La bande suit le JOUR DE LA SEMAINE, pas le rang de la ligne : mardi et
// jeudi sont teintés partout, dans la vue Semaine comme dans le planning
// global, et un jour fermé ou férié qu'une vue omet ne décale pas les
// suivants. Un « nth-child » en CSS aurait compté l'en-tête et, dans le
// planning global, les séparateurs de semaine comme des jours.
export function classeLigne(date) {
  return dayOfWeek(date) % 2 === 0 ? ' class="ligne-alt"' : '';
}
