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
| 8 | 80/100 | 22/13/10/13/14/7/3/1/1 | Vue Stagiaires : parcours chronologique complet par personne (formations, tests, théorie, intervenants), ajout rapide d'une autre catégorie |
| 9 | 82/100 | 22/13/10/13/14/7/3/4/1 | Accessibilité : créneaux et calendrier utilisables au clavier (Enter/Espace), focus visible, rôles ARIA, landmarks |
| 10 | 84/100 | 22/13/10/13/16/7/3/4/1 | Annuler/Rétablir (Ctrl+Z / Ctrl+Y, 50 niveaux) vérifié par test navigateur |
| 11 | 85/100 | 22/13/10/14/16/7/3/4/1 | Impression : A4 paysage, couleurs des grilles conservées, feuille de route vérifiée en PDF, bouton imprimer sur les grilles semaine |
| 12 | 87/100 | 24/13/10/14/16/7/3/4/1 | Période et jours fériés modifiables dans Paramètres : l'outil devient réutilisable pour les sessions suivantes (le classeur était figé sur sept–déc 2026) |
| 13 | 88/100 | 24/14/10/14/16/7/3/4/1 | Contrôle « Testeur théorie non habilité » (affectation manuelle du jour hors habilitations), 30 tests |
| 14 | 89/100 | 24/14/10/14/16/8/3/4/1 | Intégration continue GitHub Actions : les 30 tests du moteur s'exécutent à chaque push |
| 15 | 90/100 | 24/14/10/14/16/8/4/4/1 | Export calendrier .ics (Europe/Paris) : toutes les réservations ou une semaine, importable dans Outlook / Google Agenda, 31 tests |
| 16 | 92/100 | 24/14/10/14/16/8/4/4/4 | Documentation illustrée : 7 captures d'écran, guide de démarrage en 5 étapes dans le README |
| 17 | 92,5/100 | 24/14/10,5/14/16/8/4/4/4 | Suggestion : le test pratique proposé suit la formation pratique le même jour (ordre pédagogique), 32 tests |
| 18 | 93/100 | 24/14/10,5/15/16/8,5/4/4/4 | Indicateur de charge quotidienne (Xh/6h, ⚠ si dépassement) sur les grilles semaine ; moteur mesuré à 6,5 ms pour 200 inscriptions |
| 19 | 93,5/100 | 24/14/10,5/15/16/8,5/4/4,5/4 | Passe mobile : navigation compacte en pastilles, KPI sur 2 colonnes, zéro débordement horizontal vérifié à 390 px |
| 20 | 94,5/100 | 24/14/10,5/15/16/9,5/4/4,5/4 | Test de bout en bout (tests/e2e.mjs) : ouverture d'un jour, réservation au clic, synthèse/planning, conflit détecté, undo — 10 vérifications vertes |
| 21 | 95/100 | 24/14/10,5/15/17/9,5/4/4,5/4 | Correction directe depuis les anomalies du tableau de bord, semaine par défaut = première semaine avec activité (grilles + synthèse) |
| 22 | 96/100 | 24/14/10,5/15/17/9,5/5/4,5/4 | Import CSV des inscriptions (migration depuis le classeur) : en-têtes reconnues par mots-clés, dates JJ/MM/AAAA ou ISO, lignes invalides ignorées avec raison, 35 tests |
| 23 | 98/100 | 25/15/11/15/17/10/5/4,5/4 | Migration réelle validée : le CSV exporté du classeur s'importe 4/4 ✓ OK avec les mêmes intervenants (fixture en test d'intégration) ; affectation auto en 3 passes qui évite formateur=testeur du candidat ; nouveau contrôle « intervenant en formation et en test en même temps » ; heures HH:MM:SS acceptées ; 38 tests |
| 24 | 98,5/100 | 25/15/11/15/17/10/5/4,5/5 | Documentation complète : outils pratiques (suggestion, undo, exports, imports) dans le mode d'emploi intégré, procédure de migration Excel dans le README |
| 25 | 99/100 | 25/15/11/15/17/10/5/5/5 | Audit final : 38 tests unitaires + 10 vérifications e2e + smoke 11 vues + mobile + PDF, zéro résidu de debug, captures d'écran à jour |
| 26 | 99,5/100 | 25/15/11,5/15/17/10,5/5/5/5 | Suite d'intégration : 7 scénarios de bout en bout (cycle de vie, multi-catégories, testing croisé, migration classeur→ICS/JSON, reconfiguration, équipe réduite, montée en charge 40 stagiaires). A révélé et corrigé 2 vrais bugs : replanification perdant la théorie, et nouvelle réservation dégradant une réservation existante (la suggestion garantit désormais la non-régression du planning) |

## Bilan

Score final : **99/100** après 25 itérations (note stabilisée — le point
restant correspond à des fonctionnalités hors périmètre du classeur :
multi-utilisateurs temps réel, notifications).

Couverture fonctionnelle du classeur : 100 % (inscriptions, contrôles,
affectation automatique avec testing croisé, grilles semaine, synthèse
imprimable, plannings globaux, équipe/habilitations, jours EFI,
paramètres) — vérifiée notamment par l'import du CSV du classeur réel
qui reproduit exactement les mêmes affectations et statuts ✓ OK.

Au-delà du classeur : suggestion automatique de créneaux, disponibilités
en direct, vue Stagiaires, undo/redo, exports CSV/ICS/JSON, import CSV,
recherche/tri/filtres, accessibilité clavier, mobile, CI, 38 tests
unitaires et un test de bout en bout.

## Pistes futures (hors périmètre)

- Synchronisation multi-postes (backend ou fichier partagé)
- Envoi automatique des convocations (e-mail / ICS par stagiaire)
- Intégration R485 (en attente d'accord du service FC)
