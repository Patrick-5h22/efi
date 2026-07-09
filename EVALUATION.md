# Grille d'évaluation — Plateforme EFI

Auto-évaluation de la plateforme par rapport au classeur Excel « Planification EFI v4.2 »
(01/09/2026 → 31/12/2026). Score sur 100, mis à jour à chaque itération.

## Critères

| # | Critère | Poids | Description |
|---|---------|-------|-------------|
| 1 | Fidélité fonctionnelle | 25 | Reproduit le périmètre du classeur : inscriptions (1 ligne = 1 stagiaire × 1 catégorie), formations & durées, tests obligatoires, théorie commune, période 86 jours ouvrés |
| 2 | Contrôles automatiques | 15 | STATUT : formateur (catégories/capacité), testeur (tests simultanés, théorie), charge 6h, plage 8h-17h, tests manquants, chevauchements stagiaire, formateur ≠ testeur, habilitations, jours EFI |
| 3 | Affectation automatique | 10 | Choix d'un intervenant habilité et libre, priorité à l'intervenant du jour, testing croisé, signalement « aucun disponible » |
| 4 | Vues plannings | 15 | Grilles semaine (formateur/testeur, vert/rouge/jaune/fermé), synthèse semaine imprimable, plannings globaux 86 jours |
| 5 | UX / ergonomie | 10 | Saisie fluide, filtres, feedback immédiat, navigation claire, réservation depuis le planning |
| 6 | Qualité du code & tests | 10 | Architecture modulaire, tests unitaires du moteur, zéro dépendance fragile |
| 7 | Persistance & échanges | 5 | Sauvegarde automatique, export/import JSON, export CSV |
| 8 | Accessibilité & responsive | 5 | Clavier, contrastes, mobile, impression |
| 9 | Documentation | 5 | README, mode d'emploi intégré |

## Historique des itérations

| Itér. | Score | Détail (1/2/3/4/5/6/7/8/9) | Changements clés |
|-------|-------|-----------------------------|------------------|
| 1 | 22/100 | 8/8/5/0/0/6/1/0/1 | Moteur de planification complet (durées, semaines, affectation auto, 15 contrôles), 22 tests unitaires, modèle de données, persistance de base |

## Prochaines pistes

- Interface complète (inscriptions, plannings, synthèse)
- Grilles semaine interactives avec réservation au clic
- Export/import et impression
