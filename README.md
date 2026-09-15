# EFI — Planification des formations pratiques & tests

Application web de gestion des réservations du plateau technique EFI :
formations pratiques et tests CACES (R489, R486) et Habilitation électrique,
sur la période du **01/09/2026 au 31/12/2026** (86 jours ouvrés, période
modifiable).

Transposition fidèle du classeur Excel « Planification EFI v4.2 » :
même principe (1 ligne = 1 stagiaire × 1 catégorie), mêmes contrôles
automatiques, mêmes vues (grilles semaine, synthèse imprimable, plannings
formateur/testeur), avec en plus le confort d'une vraie application.

![Grille semaine](docs/screenshots/grille-semaine.png)

## Lancer l'application

Aucune installation, aucune dépendance. Il suffit d'un serveur statique :

```bash
cd efi
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Les données sont sauvegardées automatiquement dans le navigateur
(localStorage) et peuvent être exportées/importées en JSON.
Une **base partagée Supabase** permet de synchroniser le planning entre
plusieurs postes. Sur le site déployé (Vercel), l'accès est protégé par
des **comptes nominatifs Better Auth** (les mêmes que l'application
EFI Placement) ; en local, bouton ☁ + code d'accès
(voir [docs/SUPABASE.md](docs/SUPABASE.md)).

**Migration depuis le classeur Excel** : enregistrer l'onglet
« Inscriptions » au format CSV puis l'importer depuis la page
Inscriptions (bouton « ⬆ CSV ») — les en-têtes, formations et
intervenants sont reconnus automatiquement.

## Principe

- Deux ressources gérées en parallèle : le **FORMATEUR** (formations
  pratiques) et le **TESTEUR** (test théorique + tests pratiques).
- Plage 08h00 – 17h00, créneaux de 30 minutes.
- Tests obligatoires pour R489 / R486 : test pratique (1h) par catégorie,
  test théorique (1h) en créneau unique (11h00 par défaut), commun à toutes
  les catégories d'une même recommandation.
- Contrôles automatiques : capacité simultanée (2 chariots en R489 Cat 3),
  charge quotidienne ≤ 6h, chevauchements, formateur ≠ testeur du candidat,
  habilitations, jours d'ouverture EFI…
- Affectation automatique d'un intervenant habilité et libre (priorité à
  l'intervenant du jour), testing croisé possible.

## Thèmes

10 presets de couleur (teal par défaut, néon pour le mode sombre) et
modes clair / sombre / système via le bouton 🎨 de la barre latérale.
Le système de tokens (OKLCH, `css/tokens.css`) est repris du projet
efi-placement pour une identité visuelle commune.

## Guide de démarrage

1. **Équipe** : saisir les intervenants et cocher leurs habilitations
   (F = former, T = tester) par spécialité.
2. **Jours EFI** : cliquer sur le calendrier pour ouvrir les jours du
   plateau technique ; affecter éventuellement un formateur/testeur du jour.
3. **Inscrire** : depuis la page Inscriptions, un créneau libre d'une grille
   semaine, ou le bouton « ➕ » — le bouton « 💡 Proposer des créneaux »
   trouve automatiquement la première combinaison sans conflit.
4. **Vérifier** : la colonne STATUT signale toute anomalie en rouge
   (conflits d'intervenants, capacité, charge, jours fermés…).
5. **Distribuer** : imprimer la Synthèse semaine (feuille de route) ou
   exporter en `.ics` vers Outlook / Google Agenda.

| | |
|---|---|
| ![Tableau de bord](docs/screenshots/tableau-de-bord.png) | ![Inscriptions](docs/screenshots/inscriptions.png) |
| ![Formulaire](docs/screenshots/formulaire.png) | ![Stagiaires](docs/screenshots/stagiaires.png) |
| ![Synthèse](docs/screenshots/synthese.png) | ![Jours EFI](docs/screenshots/jours-efi.png) |

## Tests

```bash
npm run verify     # lint + garde-fou secrets + tests unitaires
npm test           # tests unitaires seuls (moteur, magasin, outils et route MCP)
npm run test:ui    # vérifications navigateur (démarre le serveur statique)
npm run lint
npm run secrets    # aucun code d'accès ni jeton ne doit entrer au dépôt
```

Les suites navigateur demandent un Chromium :

```bash
npx playwright install chromium
# ou, si un binaire est déjà présent :
PLAYWRIGHT_EXECUTABLE=/chemin/vers/chromium npm run test:ui
```

En CI (GitHub Actions), trois jobs tournent en parallèle sur chaque pull
request : tests unitaires, lint & secrets, suites navigateur. Un quatrième
workflow interroge la production après chaque déploiement réussi — il vérifie
notamment que `/api/state` exige une session et que `/api/mcp` refuse l'accès
sans jeton valide.

## Architecture

```
index.html          Point d'entrée (SPA sans build)
css/style.css       Styles
js/config.js        Paramètres par défaut (issus du classeur)
js/dates.js         Dates, semaines ISO, créneaux
js/store.js         État, persistance, import/export
js/engine.js        Moteur : affectation auto + contrôles (STATUT)
js/persisted.js     Champs réellement enregistrés en base (liste unique)
js/db.js            Synchronisation base partagée (code d'accès ou API)
js/auth-client.js   Client Better Auth (session, connexion, déconnexion)
js/ca.js            Agrégation du chiffre d'affaires (hors moteur)
js/mcp.js           Outils MCP : recherche de créneaux, pré-réservation
js/views/…          Vues (inscriptions, semaines, synthèse, plannings…)
consent.html        Écran d'autorisation OAuth (sert /consent et /login)
api/                Fonctions serverless Vercel (Better Auth, /api/state, /api/mcp)
scripts/            Outillage de dépôt (garde-fou secrets)
docs/migrations/    SQL à relire et appliquer à la main sur Supabase
tests/              Tests unitaires (node:test)
tests/ui/           Vérifications navigateur (Playwright)
```

Le front reste 100 % statique et sans build. Les dépendances d'exécution
(`better-auth`, `@better-auth/mcp`, `pg`) servent aux fonctions serverless du
dossier `api/` ;
celles de développement (`eslint`, `playwright`) ne servent qu'à la
vérification et ne partent jamais en production.

Un serveur MCP expose le planning aux commerciaux en clientèle. Il accepte
deux authentifications : des jetons nominatifs déclarés sur Vercel, et —
quand `MCP_OAUTH` est activé — un flux OAuth 2.1 adossé aux comptes Microsoft
de l'application, administrable depuis une organisation Claude Team. Voir
[docs/MCP.md](docs/MCP.md), qui donne l'ordre d'activation à respecter.

Voir [EVALUATION.md](EVALUATION.md) pour la grille d'évaluation et
l'historique des itérations.
