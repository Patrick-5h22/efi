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
