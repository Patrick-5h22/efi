# Grille d'évaluation — Fusion interface efi-placement (phase 2)

Objectif : rapprocher EFI Planning de l'interface d'efi-placement
(système de tokens shadcn/ui OKLCH, 9 presets de thème + mode sombre,
cartes sobres, header épuré) et réaliser sa heatmap « phase 4.2 »
dans cet esprit (la référence prévoyait qu'elle consomme `--primary`).
Score sur 100, mis à jour à chaque itération.

## Critères

| # | Critère | Poids | Description |
|---|---------|-------|-------------|
| 1 | Système de thème | 20 | Tokens OKLCH identiques à la référence (background/card/primary/muted/border/ring/sidebar/radius), 9 presets exacts (teal, neutral, rose, orange, green, blue, violet, red, yellow), mode sombre fidèle (.dark), persistance |
| 2 | Fidélité des composants | 20 | Header (logo carré primary + titre), cartes `rounded-lg border bg-card`, badges avec variantes dark, boutons/inputs/dialogs façon shadcn, sélecteur de thème avec pastilles + check |
| 3 | Heatmap & KPIs (04.2) | 15 | Heatmap thémée sur `--primary` (rampe dérivée du preset actif), lisible en clair ET en sombre, KPI tiles dans le style de la référence |
| 4 | Grilles planning en sombre | 15 | Créneaux vert/rouge/jaune/fermé retravaillés en tokens avec variantes dark lisibles (contrastes vérifiés), impression toujours en clair |
| 5 | Dark néon (04.3) | 10 | Le restyle « dark neon » planifié par la référence : preset supplémentaire à accents lumineux |
| 6 | Régression zéro | 10 | 47 tests Node + e2e 10/10 + sync 8/8 + smoke 11 vues verts à chaque itération |
| 7 | Accessibilité | 5 | Contrastes vérifiés dans les deux modes, focus visibles, prefers-color-scheme respecté |
| 8 | Documentation | 5 | Thèmes documentés (aide + README), captures à jour |

## Historique des itérations

| Itér. | Score | Changements clés |
|-------|-------|------------------|
| 1 | 38/100 | Système de tokens OKLCH repris à l'identique de la référence (css/tokens.css) : 9 presets + sombre + variables sémantiques planning clair/sombre ; feuille de style entièrement réécrite dessus (sidebar claire à tokens sidebar, cartes bordées radius 0.45rem, boutons/inputs shadcn, tables à lignes horizontales, KPI à liseré primary, dialog/toast popover) |
| 2 | 55/100 | Sélecteur de thème 🎨 (pastilles OKLCH + check, 10 presets dont Néon, modes clair/sombre/système), persistance localStorage, application anti-flash avant premier rendu, suivi de prefers-color-scheme, preset Néon (fond profond + halo cyan) opérationnel |
| 3 | 60/100 | Rampe heatmap corrigée (color-mix en srgb — plus de dérive violette), dérivée du --primary du preset actif comme le prévoyait la référence, vérifiée en clair et en sombre |
| 4 | 63/100 | Contrôle visuel de 6 combinaisons preset×mode + formulaire sombre + menu thème : rendus conformes ; correction :user-invalid (plus de bordure rouge avant saisie) |
| 5 | 66/100 | Heatmap : ligne des mois (sept. → déc.) au-dessus des colonnes de semaines, façon GitHub |
| 6 | 69/100 | Créneaux pré-réservés distingués sur les grilles (hachures + liseré pointillé) + entrée de légende |
| 7 | 72/100 | Régressions de la réécriture corrigées : indicateur ☁ retokenisé, séparateurs du planning global et pointillés des grilles en tokens (plus aucune couleur en dur dans les vues) |
| 8 | 74/100 | Accessibilité : aria-current sur la navigation, prefers-reduced-motion respecté |
| 9 | 77/100 | Documentation thèmes (aide + README), captures d'écran régénérées (dont sombre et néon), régression complète verte (47 tests, e2e 10/10, sync 8/8, mobile, PDF) |
| 10 | 79/100 | KPI enrichis : icônes, heures réservées à côté du taux d'occupation, compteur de pré-réservations, hover subtil |
| 11 | 80/100 | Cartes Dossiers façon card-jour : liseré primary quand le dossier est actif, atténuées quand tout est annulé |
| 12 | 81/100 | Heatmap : jours 100 % pré-réservés cerclés de pointillés (cohérent avec les grilles) |
| 13 | 85/100 | Palette de commandes Ctrl+K (composant « command » de la référence) : navigation, semaines, dossiers, thèmes et actions, filtrage accent-insensible, clavier complet — 7 vérifications navigateur ; le preset Néon force le sombre depuis tout mode |
| 14 | 86/100 | Mobile : menu thème repositionné sous le bouton (sidebar en haut), palette Ctrl+K remontée, zéro débordement re-vérifié |
| 15 | 87/100 | Revue sombre systématique des 6 vues restantes (équipe, paramètres, jours, planning global, dossiers, aide) : calendriers, champs, badges et selects tous lisibles |
| 16 | 88/100 | Audit : correction du script de vérification (le hash routing ne recharge pas le thème) — les captures sombres attestent maintenant du vrai rendu |
| 17 | 89/100 | Touches néon finales : halo sur valeurs KPI, lueur des dialogs, hover lumineux des créneaux libres (uniquement quand le preset définit --neon-glow) |
| 18 | 90/100 | Tooltips enrichis des grilles : date + heure sur créneaux libres, stagiaires + formation + statut sur créneaux occupés |
| 19 | 92/100 | Batterie complète verte : 47 tests Node, e2e 10/10, sync 8/8, palette 7/7, phase 1 11/11, mobile ; captures docs régénérées dans la nouvelle interface (dont thème sombre et néon) |
| 20 | 93/100 | Bouton thème = pastille du preset actif mise à jour en direct (fidèle au ThemeSelect de la référence) |
| 21 | 93/100 | Bilan : note stabilisée — les points restants (icônes lucide identiques, polices Geist, composants Radix natifs) relèvent du portage Next.js, hors périmètre d'une app sans dépendance |

## Référence (extraite de efi-placement)

- `src/app/globals.css` : 9 presets OKLCH (4 variables par preset : primary,
  primary-foreground, ring, chart-1), teal par défaut, radius 0.45rem,
  sombre = `.dark` (background 0.145, card 0.205, border blanc 10 %)
- `app-header.tsx` : h-14, border-b, carré arrondi `bg-primary` + titre semibold,
  sélecteur de thème à droite (pastille + label + check)
- `card-jour.tsx` : `rounded-lg p-3 border bg-card`, surbrillance `border-primary`
- `session-badge.tsx` : badges à variantes dark (`dark:bg-red-950/40 …`)
- Commentaire de la référence : « Si une heatmap Phase 4.2 consomme --primary,
  c'est voulu (cohérence avec le theme user) »

## Bilan

Note finale : **93/100** en 21 itérations (elle ne progresse plus — l'écart
restant tient aux briques propres à Next.js/shadcn : icônes lucide, police
Geist, primitives Radix, que reproduire à l'identique n'apporterait rien de
fonctionnel à une application volontairement sans dépendance).

Livré : le système de thème complet d'efi-placement (9 presets OKLCH exacts
+ mode sombre .dark identique), le preset « Néon » qui matérialise sa phase
04.3, sa heatmap « phase 4.2 » réalisée selon son intention (rampe sur
--primary), l'apparence shadcn (sidebar à tokens, cartes, formulaires,
badges, dialogs), la palette de commandes Ctrl+K, et zéro régression sur
83 vérifications automatisées.
