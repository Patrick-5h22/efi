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
| 2 | 64/100 | 18/11/7/11/6/6/3/1/1 | Application complète : 10 vues (tableau de bord, inscriptions + formulaire avec aperçu des conflits en direct, grilles semaine cliquables, synthèse imprimable, plannings globaux, équipe, jours EFI, paramètres, mode d'emploi), export JSON/CSV, smoke test Playwright sans erreur |
| 3 | 67/100 | 19/11/7/12/8/6/3/1/1 | Grilles semaine : jours hors période distingués, intervenant du jour déduit de l'activité (auto), clic sur créneau occupé = édition de l'inscription |
| 4 | 70/100 | 20/13/7/12/8/7/3/1/1 | Contrôle de dépassement de capacité (3 candidats / 2 chariots), théorie en double signalée, comptage théorie par stagiaire unique, 25 tests |
| 5 | 72/100 | 20/13/7/12/10/7/3/1/1 | Tableau des inscriptions : tri par colonne, bouton de duplication pour les stagiaires multi-catégories |
| 6 | 75/100 | 21/13/9/12/11/7/3/1/1 | Disponibilités « Dispo (auto) » intégrées au formulaire : chaque intervenant annoté ✓ libre / occupé / non habilité sur les créneaux choisis, 27 tests |
| 7 | 78/100 | 21/13/10/12/13/7/3/1/1 | Bouton « 💡 Proposer des créneaux » : recherche automatique de la première combinaison pratique + test + théorie sans conflit (théorie omise si déjà planifiée pour la recommandation), 29 tests |

## Prochaines pistes

- Interface complète (inscriptions, plannings, synthèse)
- Grilles semaine interactives avec réservation au clic
- Export/import et impression
